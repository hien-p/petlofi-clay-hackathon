import { Transaction } from "@mysten/sui/transactions";
import { getPublicConfig } from "./config";

export function buildMintPetTransaction(assetBlob: string): Transaction {
  const config = getPublicConfig();
  if (!config.packageId || !config.defaultTemplateId) {
    throw new Error("PetLofi package ID and template ID are required to build a mint transaction.");
  }

  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::${config.moduleName}::mint_pet`,
    arguments: [tx.object(config.defaultTemplateId), tx.pure.vector("u8", [...new TextEncoder().encode(assetBlob)])]
  });
  return tx;
}

export function buildRecordActionTransaction(petObjectId: string, action: number, proofBlob: string): Transaction {
  const config = getPublicConfig();
  if (!config.packageId) {
    throw new Error("PetLofi package ID is required to build an action transaction.");
  }

  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::${config.moduleName}::record_agent_action`,
    arguments: [
      tx.object(petObjectId),
      tx.pure.u8(action),
      tx.pure.vector("u8", [...new TextEncoder().encode(proofBlob)]),
      tx.object("0x6")
    ]
  });
  return tx;
}

function requirePackage() {
  const config = getPublicConfig();
  if (!config.packageId) {
    throw new Error("PetLofi package ID is required to build this transaction.");
  }
  return config;
}

export function buildFeedTransaction(petObjectId: string, treatKind = 0): Transaction {
  const config = requirePackage();
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::${config.moduleName}::feed`,
    arguments: [tx.object(petObjectId), tx.pure.u8(treatKind), tx.object("0x6")]
  });
  return tx;
}

export function buildRestTransaction(petObjectId: string): Transaction {
  const config = requirePackage();
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::${config.moduleName}::rest`,
    arguments: [tx.object(petObjectId), tx.object("0x6")]
  });
  return tx;
}

export function buildEvolveTransaction(petObjectId: string): Transaction {
  const config = requirePackage();
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::${config.moduleName}::evolve`,
    arguments: [tx.object(petObjectId), tx.object("0x6")]
  });
  return tx;
}

export function buildSyncMemoryTransaction(petObjectId: string, memoryBlob: string, memoryHash: string): Transaction {
  const config = requirePackage();
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::${config.moduleName}::sync_memory`,
    arguments: [
      tx.object(petObjectId),
      tx.pure.vector("u8", [...new TextEncoder().encode(memoryBlob)]),
      tx.pure.vector("u8", [...new TextEncoder().encode(memoryHash)])
    ]
  });
  return tx;
}
