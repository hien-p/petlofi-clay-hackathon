#[test_only]
module petlofi::petlofi_tests;

use petlofi::petlofi;
use std::unit_test::destroy;
use sui::{clock, test_scenario::begin};

const ALICE: address = @0xA;
#[test]
fun mint_increments_supply() {
    let mut test = begin(ALICE);
    let mut template = petlofi::create_template_for_test(2, test.ctx());
    let pet = petlofi::mint_pet_for_test(&mut template, ALICE, test.ctx());
    let (minted, max) = petlofi::template_supply(&template);
    let (level, xp, mood, energy, streak, evolution) = petlofi::pet_stats(&pet);
    assert!(minted == 1, 0);
    assert!(max == 2, 1);
    assert!(level == 1, 2);
    assert!(xp == 0, 3);
    assert!(mood == 80, 4);
    assert!(energy == 80, 5);
    assert!(streak == 0, 6);
    assert!(evolution == 0, 7);
    destroy(pet);
    destroy(template);
    destroy(test.end());
}

#[test, expected_failure(abort_code = petlofi::EMaxSupplyReached)]
fun mint_respects_supply_cap() {
    let mut test = begin(ALICE);
    let mut template = petlofi::create_template_for_test(1, test.ctx());
    let pet = petlofi::mint_pet_for_test(&mut template, ALICE, test.ctx());
    destroy(pet);
    let pet2 = petlofi::mint_pet_for_test(&mut template, ALICE, test.ctx());
    destroy(pet2);
    destroy(template);
    destroy(test.end());
}

#[test, expected_failure(abort_code = petlofi::EInvalidAction)]
fun action_validation_rejects_unknown_action() {
    let mut test = begin(ALICE);
    let mut template = petlofi::create_template_for_test(1, test.ctx());
    let mut pet = petlofi::mint_pet_for_test(&mut template, ALICE, test.ctx());
    let clock = clock::create_for_testing(test.ctx());
    petlofi::record_agent_action(&mut pet, 99, b"proof", &clock, test.ctx());
    clock::destroy_for_testing(clock);
    destroy(pet);
    destroy(template);
    destroy(test.end());
}

#[test, expected_failure(abort_code = petlofi::ENotReadyToEvolve)]
fun evolve_requires_level_threshold() {
    let mut test = begin(ALICE);
    let mut template = petlofi::create_template_for_test(1, test.ctx());
    let mut pet = petlofi::mint_pet_for_test(&mut template, ALICE, test.ctx());
    let clock = clock::create_for_testing(test.ctx());
    petlofi::evolve(&mut pet, &clock, test.ctx());
    clock::destroy_for_testing(clock);
    destroy(pet);
    destroy(template);
    destroy(test.end());
}
