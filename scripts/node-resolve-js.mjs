/**
 * Node ESM loader: .js suffix + supabase shim za measure skripte.
 */
const shimUrl = new URL("./supabase-node-shim.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || "";

  if (
    (specifier === "./supabase" || specifier.endsWith("/supabase")) &&
    parent.includes("/src/lib/")
  ) {
    return { url: shimUrl, shortCircuit: true };
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !specifier.endsWith(".js")
  ) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (err?.code === "ERR_MODULE_NOT_FOUND") {
        return nextResolve(`${specifier}.js`, context);
      }
      throw err;
    }
  }

  return nextResolve(specifier, context);
}
