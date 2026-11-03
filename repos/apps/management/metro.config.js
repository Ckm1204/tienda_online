import { getDefaultConfig } from "expo/metro-config";

const config = getDefaultConfig(import.meta.dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "node:crypto" || moduleName === "crypto") {
    if (platform !== "web") {
      return {
        type: "empty"
      };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

export default config;
