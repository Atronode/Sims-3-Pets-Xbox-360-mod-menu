# Patch generator

You don't need these files to use the mod menu. They show how `mod-menu/mod_patches.json` is made.

- `clr.js` reads .NET metadata and disassembles method code.
- `modbuild.js` assembles the mod menu's code and writes the patch file.

To run the generator you need `Sims3GameplaySystems` saved from your own game's memory while it runs. That file is EA's code, so it isn't included here.

```bash
node modbuild.js path/to/Sims3GameplaySystems.dll ../mod-menu/mod_patches.json
```

The patch file holds only the new code and text, plus SHA-256 hashes of the bytes they replace.
