/// Sui game state for PetLofi AI companion NFTs.
#[allow(duplicate_alias, lint(public_entry))]
module petlofi::petlofi;

use std::string::{String, utf8};
use std::vector;
use sui::clock::{Self, Clock};
use sui::event;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const EInvalidMaxSupply: u64 = 0;
const EMaxSupplyReached: u64 = 1;
const ENotOwner: u64 = 2;
const ECooldown: u64 = 3;
const ENotReadyToEvolve: u64 = 4;
const EInvalidAction: u64 = 5;
const EEmptyProof: u64 = 6;

const ACTION_CODING: u8 = 0;
const ACTION_REVIEWING: u8 = 1;
const ACTION_NEEDS_INPUT: u8 = 2;
const ACTION_FAILED: u8 = 3;
const ACTION_COMPLETED: u8 = 4;

const MAX_STAT: u8 = 100;
const CARE_COOLDOWN_MS: u64 = 30_000;

public struct PetTemplate has key, store {
    id: UID,
    name: String,
    creator: address,
    max_supply: u64,
    minted_count: u64,
    walrus_asset_blob: vector<u8>,
    animation_hash: vector<u8>,
}

public struct Pet has key, store {
    id: UID,
    owner: address,
    template_id: ID,
    level: u64,
    xp: u64,
    mood: u8,
    energy: u8,
    streak: u64,
    last_action_ms: u64,
    evolution_stage: u8,
    latest_memory_blob: vector<u8>,
}

public struct PetMinted has copy, drop {
    pet_id: ID,
    template_id: ID,
    owner: address,
}

public struct PetActionRecorded has copy, drop {
    pet_id: ID,
    action: u8,
    proof_blob_hash_hint: vector<u8>,
    xp: u64,
    level: u64,
    mood: u8,
    energy: u8,
    streak: u64,
}

public struct MemorySynced has copy, drop {
    pet_id: ID,
    memory_blob: vector<u8>,
    memory_hash: vector<u8>,
}

public entry fun create_template(
    name: vector<u8>,
    max_supply: u64,
    walrus_asset_blob: vector<u8>,
    animation_hash: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(max_supply > 0, EInvalidMaxSupply);
    let sender = tx_context::sender(ctx);
    let template = PetTemplate {
        id: object::new(ctx),
        name: utf8(name),
        creator: sender,
        max_supply,
        minted_count: 0,
        walrus_asset_blob,
        animation_hash,
    };
    // Shared so any connected wallet can mint a pet from this collection.
    transfer::share_object(template);
}

public entry fun mint_pet(template: &mut PetTemplate, asset_blob: vector<u8>, ctx: &mut TxContext) {
    let owner = tx_context::sender(ctx);
    let pet = mint_pet_inner(template, asset_blob, owner, ctx);
    event::emit(PetMinted {
        pet_id: object::id(&pet),
        template_id: object::id(template),
        owner,
    });
    transfer::public_transfer(pet, owner);
}

public entry fun record_agent_action(pet: &mut Pet, action: u8, proof_blob: vector<u8>, clock: &Clock, ctx: &mut TxContext) {
    assert_owner(pet, ctx);
    assert!(is_valid_action(action), EInvalidAction);
    assert!(vector::length(&proof_blob) > 0, EEmptyProof);

    let now = clock::timestamp_ms(clock);
    pet.last_action_ms = now;

    if (action == ACTION_FAILED) {
        pet.xp = pet.xp + 4;
        pet.mood = sub_floor(pet.mood, 10);
        pet.energy = sub_floor(pet.energy, 8);
        pet.streak = 0;
    } else {
        let xp_gain = if (action == ACTION_COMPLETED) 24 else 10;
        let mood_gain = if (action == ACTION_COMPLETED) 8 else 2;
        let energy_cost = if (action == ACTION_NEEDS_INPUT) 2 else 6;
        pet.xp = pet.xp + xp_gain;
        pet.mood = add_clamped(pet.mood, mood_gain);
        pet.energy = sub_floor(pet.energy, energy_cost);
        if (action == ACTION_COMPLETED) {
            pet.streak = pet.streak + 1;
        };
    };

    pet.level = pet.xp / 100 + 1;
    event::emit(PetActionRecorded {
        pet_id: object::id(pet),
        action,
        proof_blob_hash_hint: proof_blob,
        xp: pet.xp,
        level: pet.level,
        mood: pet.mood,
        energy: pet.energy,
        streak: pet.streak,
    });
}

public entry fun feed(pet: &mut Pet, treat_kind: u8, clock: &Clock, ctx: &mut TxContext) {
    assert_owner(pet, ctx);
    assert_care_ready(pet, clock);
    let mood_gain = if (treat_kind == 0) 10 else 6;
    let energy_gain = if (treat_kind == 0) 4 else 12;
    pet.mood = add_clamped(pet.mood, mood_gain);
    pet.energy = add_clamped(pet.energy, energy_gain);
    pet.last_action_ms = clock::timestamp_ms(clock);
}

public entry fun rest(pet: &mut Pet, clock: &Clock, ctx: &mut TxContext) {
    assert_owner(pet, ctx);
    assert_care_ready(pet, clock);
    pet.energy = add_clamped(pet.energy, 25);
    pet.mood = add_clamped(pet.mood, 2);
    pet.last_action_ms = clock::timestamp_ms(clock);
}

public entry fun sync_memory(pet: &mut Pet, memory_blob: vector<u8>, memory_hash: vector<u8>, ctx: &mut TxContext) {
    assert_owner(pet, ctx);
    assert!(vector::length(&memory_blob) > 0, EEmptyProof);
    assert!(vector::length(&memory_hash) > 0, EEmptyProof);
    pet.latest_memory_blob = memory_blob;
    event::emit(MemorySynced {
        pet_id: object::id(pet),
        memory_blob: pet.latest_memory_blob,
        memory_hash,
    });
}

public entry fun evolve(pet: &mut Pet, _clock: &Clock, ctx: &mut TxContext) {
    assert_owner(pet, ctx);
    let next_stage = pet.evolution_stage + 1;
    let required_level = (next_stage as u64) * 3;
    assert!(pet.level >= required_level, ENotReadyToEvolve);
    pet.evolution_stage = next_stage;
    pet.mood = add_clamped(pet.mood, 12);
}

public fun template_supply(template: &PetTemplate): (u64, u64) {
    (template.minted_count, template.max_supply)
}

public fun pet_stats(pet: &Pet): (u64, u64, u8, u8, u64, u8) {
    (pet.level, pet.xp, pet.mood, pet.energy, pet.streak, pet.evolution_stage)
}

#[test_only]
public fun create_template_for_test(max_supply: u64, ctx: &mut TxContext): PetTemplate {
    assert!(max_supply > 0, EInvalidMaxSupply);
    PetTemplate {
        id: object::new(ctx),
        name: utf8(b"Lofi Yeti"),
        creator: tx_context::sender(ctx),
        max_supply,
        minted_count: 0,
        walrus_asset_blob: b"walrus_blob",
        animation_hash: b"animation_hash",
    }
}

#[test_only]
public fun mint_pet_for_test(template: &mut PetTemplate, owner: address, ctx: &mut TxContext): Pet {
    mint_pet_inner(template, b"asset_blob", owner, ctx)
}

fun mint_pet_inner(template: &mut PetTemplate, asset_blob: vector<u8>, owner: address, ctx: &mut TxContext): Pet {
    assert!(template.minted_count < template.max_supply, EMaxSupplyReached);
    assert!(vector::length(&asset_blob) > 0, EEmptyProof);
    template.minted_count = template.minted_count + 1;
    Pet {
        id: object::new(ctx),
        owner,
        template_id: object::id(template),
        level: 1,
        xp: 0,
        mood: 80,
        energy: 80,
        streak: 0,
        last_action_ms: 0,
        evolution_stage: 0,
        latest_memory_blob: b"",
    }
}

fun assert_owner(pet: &Pet, ctx: &TxContext) {
    assert!(pet.owner == tx_context::sender(ctx), ENotOwner);
}

fun assert_care_ready(pet: &Pet, clock: &Clock) {
    let now = clock::timestamp_ms(clock);
    assert!(pet.last_action_ms == 0 || now >= pet.last_action_ms + CARE_COOLDOWN_MS, ECooldown);
}

fun is_valid_action(action: u8): bool {
    action == ACTION_CODING ||
        action == ACTION_REVIEWING ||
        action == ACTION_NEEDS_INPUT ||
        action == ACTION_FAILED ||
        action == ACTION_COMPLETED
}

fun add_clamped(value: u8, delta: u8): u8 {
    let sum = (value as u64) + (delta as u64);
    if (sum > (MAX_STAT as u64)) MAX_STAT else (sum as u8)
}

fun sub_floor(value: u8, delta: u8): u8 {
    if (value < delta) 0 else value - delta
}
