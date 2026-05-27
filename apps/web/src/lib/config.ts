export function getPublicConfig() {
  return {
    suiNetwork: process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet",
    packageId: process.env.NEXT_PUBLIC_PETLOFI_PACKAGE_ID ?? "",
    moduleName: process.env.NEXT_PUBLIC_PETLOFI_MODULE ?? "petlofi",
    defaultTemplateId: process.env.NEXT_PUBLIC_DEFAULT_PET_TEMPLATE_ID ?? ""
  };
}

export function isOnChainConfigured(): boolean {
  const config = getPublicConfig();
  return Boolean(config.packageId && config.defaultTemplateId);
}
