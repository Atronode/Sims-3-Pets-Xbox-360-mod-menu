// Read-only .NET metadata reader plus a small IL disassembler, for the assemblies saved from guest memory.
const fs = require('fs');
function load(file) {
  const b = fs.readFileSync(file);
  const pe = b.readUInt32LE(0x3C), nsec = b.readUInt16LE(pe + 6), opt = b.readUInt16LE(pe + 20);
  const secs = []; for (let i = 0; i < nsec; i++) { const o = pe + 24 + opt + i * 40; secs.push({ va: b.readUInt32LE(o + 12), vs: b.readUInt32LE(o + 8), ptr: b.readUInt32LE(o + 20), rs: b.readUInt32LE(o + 16) }); }
  const rva = r => { for (const s of secs) if (r >= s.va && r < s.va + Math.max(s.vs, s.rs)) return r - s.va + s.ptr; return -1; };
  const cli = rva(b.readUInt32LE(pe + 24 + 208));
  const mdr = rva(b.readUInt32LE(cli + 8));
  const vl = b.readUInt32LE(mdr + 12); let o = mdr + 16 + vl + 2; const ns = b.readUInt16LE(o); o += 2;
  const S = {};
  for (let i = 0; i < ns; i++) { const off = b.readUInt32LE(o), sz = b.readUInt32LE(o + 4); o += 8; let e = o; while (b[e]) e++; const nm = b.toString('latin1', o, e); o = (e + 4) & ~3; S[nm] = { off: mdr + off, sz }; }
  const t = S['#~'] || S['#-']; let p = t.off;
  const hs = b[p + 6], valid = b.readBigUInt64LE(p + 8); p += 24;
  const rows = {}; for (let i = 0n; i < 64n; i++) if (valid & (1n << i)) { rows[Number(i)] = b.readUInt32LE(p); p += 4; }
  const sw = hs & 1 ? 4 : 2, gw = hs & 2 ? 4 : 2, bw = hs & 4 ? 4 : 2;
  const idx = tb => (rows[tb] || 0) > 0xFFFF ? 4 : 2;
  const cd = (tabs, bits) => Math.max(...tabs.map(x => rows[x] || 0)) >= (1 << (16 - bits)) ? 4 : 2;
  const TDR = cd([2, 1, 27], 2), HCA = cd([6, 4, 1, 2, 8, 9, 10, 0, 14, 23, 20, 17, 26, 27, 32, 35, 38, 39, 40], 5), CAT = cd([6, 10], 3), MRP = cd([2, 1, 26, 6, 27], 3), HC = cd([4, 8, 23], 2), HFM = cd([4, 8], 1), HD = cd([2, 6, 32], 2), HS = cd([20, 23], 1), MDO = cd([6, 10], 1), MF = cd([4, 6], 1), IMPL = cd([38, 35, 39], 2), RS = cd([0, 26, 35, 1], 2), TOM = cd([2, 6], 1);
  const sz = { 0: 2 + sw + 3 * gw, 1: RS + 2 * sw, 2: 4 + 2 * sw + TDR + idx(4) + idx(6), 3: idx(4), 4: 2 + sw + bw, 5: idx(4), 6: 8 + sw + bw + idx(8), 7: idx(8), 8: 4 + sw, 9: idx(2) + TDR, 10: MRP + sw + bw, 11: 2 + HC + bw, 12: HCA + CAT + bw, 13: HFM + bw, 14: 2 + HD + bw, 15: 6 + idx(2), 16: 4 + idx(4), 17: bw, 18: idx(2) + idx(20), 19: idx(20), 20: 2 + sw + TDR, 21: idx(2) + idx(23), 22: idx(23), 23: 2 + sw + bw, 24: 2 + idx(6) + HS, 25: idx(2) + MDO + MDO, 26: sw, 27: bw, 28: 2 + MF + sw + idx(26), 29: 4 + idx(4), 30: 8, 31: 4, 32: 16 + bw + sw + sw + bw, 33: 4, 34: 12, 35: 12 + bw + sw + sw + bw, 36: 4 + idx(35), 37: 12 + idx(35), 38: 4 + sw + bw, 39: 8 + sw + sw + IMPL, 40: 8 + sw + IMPL, 41: 2 * idx(2), 42: 4 + TOM + sw, 43: MDO + bw, 44: idx(42) + TDR };
  const pos = {}; for (let i = 0; i < 64; i++) if (rows[i]) { pos[i] = p; p += rows[i] * sz[i]; }
  const str = i => { let s = S['#Strings'].off + i, e = s; while (b[e]) e++; return b.toString('latin1', s, e); };
  const R = (at, w) => w === 4 ? b.readUInt32LE(at) : b.readUInt16LE(at);
  const asmName = rows[32] ? str(R(pos[32] + 16 + bw, sw)) : '?';
  const types = []; for (let i = 0; i < (rows[2] || 0); i++) { let q = pos[2] + i * sz[2]; q += 4; const name = str(R(q, sw)); q += sw; const nsn = str(R(q, sw)); q += sw + TDR; const fld = R(q, idx(4)); q += idx(4); const mth = R(q, idx(6)); types.push({ name, ns: nsn, fld, mth }); }
  const methods = []; for (let i = 0; i < (rows[6] || 0); i++) { const q = pos[6] + i * sz[6]; methods.push({ rva: b.readUInt32LE(q), name: str(R(q + 8, sw)) }); }
  const fields = []; for (let i = 0; i < (rows[4] || 0); i++) { const q = pos[4] + i * sz[4]; fields.push({ name: str(R(q + 2, sw)), flags: b.readUInt16LE(q), sigBlob: R(q + 2 + sw, bw) }); }
  types.forEach((t2, i) => { const nm = i + 1 < types.length ? types[i + 1].mth : methods.length + 1; const nf = i + 1 < types.length ? types[i + 1].fld : fields.length + 1; for (let k = t2.mth; k < nm; k++) methods[k - 1].owner = t2; for (let k = t2.fld; k < nf; k++) fields[k - 1].owner = t2; });
  const fullT = t2 => (t2.ns ? t2.ns + '.' : '') + t2.name;
  const typeRefName = i => { const q = pos[1] + (i - 1) * sz[1]; const a = str(R(q + RS, sw)), n = str(R(q + RS + sw, sw)); return (n ? n + '.' : '') + a; };
  const typeDefOrRef = coded => { const tag = coded & 3, i = coded >> 2; if (tag === 0) return fullT(types[i - 1] || { name: '?' }); if (tag === 1) return typeRefName(i); return 'TypeSpec'; };
  const memberRef = i => { const q = pos[10] + (i - 1) * sz[10]; const cl = R(q, MRP), tag = cl & 7, ci = cl >> 3; const n = str(R(q + MRP, sw)); let owner = '?'; if (tag === 0) owner = fullT(types[ci - 1]); else if (tag === 1) owner = typeRefName(ci); else if (tag === 4) owner = 'TypeSpec'; return owner + '::' + n; };
  const us = i => { let q = S['#US'].off + i; let l = b[q++]; if (l & 0x80) { if (l & 0x40) { l = ((l & 0x1F) * 0x1000000) + (b[q++] << 16) + (b[q++] << 8) + b[q++]; } else l = ((l & 0x3F) << 8) + b[q++]; } return b.toString('utf16le', q, q + l - 1); };
  const tok = t3 => { const tb = t3 >>> 24, i = t3 & 0xFFFFFF; switch (tb) { case 0x06: { const m = methods[i - 1]; return m ? fullT(m.owner) + '::' + m.name : '?m'; } case 0x0A: return memberRef(i); case 0x04: { const f = fields[i - 1]; return f ? fullT(f.owner) + '::' + f.name : '?f'; } case 0x02: return fullT(types[i - 1]); case 0x01: return typeRefName(i); case 0x1B: return 'TypeSpec#' + i; case 0x2B: return 'MethodSpec#' + i; case 0x70: return JSON.stringify(us(i)); default: return '0x' + t3.toString(16); } };
  return { asmName, types, methods, fields, b, rva, fullT, tok, typeDefOrRef, S, rows, pos, sz, sw, bw, R, str, idx };
}
const OPS = {};
const def = (start, list, kind = '') => list.split(' ').forEach((n, i) => { OPS[start + i] = [n, kind]; });
def(0x00, 'nop break ldarg.0 ldarg.1 ldarg.2 ldarg.3 ldloc.0 ldloc.1 ldloc.2 ldloc.3 stloc.0 stloc.1 stloc.2 stloc.3');
def(0x0E, 'ldarg.s ldarga.s starg.s ldloc.s ldloca.s stloc.s', 'u1');
def(0x14, 'ldnull ldc.i4.m1 ldc.i4.0 ldc.i4.1 ldc.i4.2 ldc.i4.3 ldc.i4.4 ldc.i4.5 ldc.i4.6 ldc.i4.7 ldc.i4.8');
OPS[0x1F] = ['ldc.i4.s', 'i1']; OPS[0x20] = ['ldc.i4', 'i4']; OPS[0x21] = ['ldc.i8', 'i8']; OPS[0x22] = ['ldc.r4', 'r4']; OPS[0x23] = ['ldc.r8', 'r8'];
def(0x25, 'dup pop'); OPS[0x27] = ['jmp', 't']; OPS[0x28] = ['call', 't']; OPS[0x29] = ['calli', 'sig']; OPS[0x2A] = ['ret', ''];
def(0x2B, 'br.s brfalse.s brtrue.s beq.s bge.s bgt.s ble.s blt.s bne.un.s bge.un.s bgt.un.s ble.un.s blt.un.s', 'b1');
def(0x38, 'br brfalse brtrue beq bge bgt ble blt bne.un bge.un bgt.un ble.un blt.un', 'b4');
OPS[0x45] = ['switch', 'sw'];
def(0x46, 'ldind.i1 ldind.u1 ldind.i2 ldind.u2 ldind.i4 ldind.u4 ldind.i8 ldind.i ldind.r4 ldind.r8 ldind.ref stind.ref stind.i1 stind.i2 stind.i4 stind.i8 stind.r4 stind.r8 add sub mul div div.un rem rem.un and or xor shl shr shr.un neg not conv.i1 conv.i2 conv.i4 conv.i8 conv.r4 conv.r8 conv.u4 conv.u8');
OPS[0x6F] = ['callvirt', 't']; OPS[0x70] = ['cpobj', 't']; OPS[0x71] = ['ldobj', 't']; OPS[0x72] = ['ldstr', 't']; OPS[0x73] = ['newobj', 't']; OPS[0x74] = ['castclass', 't']; OPS[0x75] = ['isinst', 't']; OPS[0x76] = ['conv.r.un', '']; OPS[0x79] = ['unbox', 't']; OPS[0x7A] = ['throw', ''];
def(0x7B, 'ldfld ldflda stfld ldsfld ldsflda stsfld stobj', 't');
def(0x82, 'conv.ovf.i1.un conv.ovf.i2.un conv.ovf.i4.un conv.ovf.i8.un conv.ovf.u1.un conv.ovf.u2.un conv.ovf.u4.un conv.ovf.u8.un conv.ovf.i.un conv.ovf.u.un');
OPS[0x8C] = ['box', 't']; OPS[0x8D] = ['newarr', 't']; OPS[0x8E] = ['ldlen', '']; OPS[0x8F] = ['ldelema', 't'];
def(0x90, 'ldelem.i1 ldelem.u1 ldelem.i2 ldelem.u2 ldelem.i4 ldelem.u4 ldelem.i8 ldelem.i ldelem.r4 ldelem.r8 ldelem.ref stelem.i stelem.i1 stelem.i2 stelem.i4 stelem.i8 stelem.r4 stelem.r8 stelem.ref');
OPS[0xA3] = ['ldelem', 't']; OPS[0xA4] = ['stelem', 't']; OPS[0xA5] = ['unbox.any', 't'];
def(0xB3, 'conv.ovf.i1 conv.ovf.u1 conv.ovf.i2 conv.ovf.u2 conv.ovf.i4 conv.ovf.u4 conv.ovf.i8 conv.ovf.u8');
OPS[0xC2] = ['refanyval', 't']; OPS[0xC3] = ['ckfinite', '']; OPS[0xC6] = ['mkrefany', 't']; OPS[0xD0] = ['ldtoken', 't'];
def(0xD1, 'conv.u2 conv.u1 conv.i conv.ovf.i conv.ovf.u add.ovf add.ovf.un mul.ovf mul.ovf.un sub.ovf sub.ovf.un endfinally');
OPS[0xDD] = ['leave', 'b4']; OPS[0xDE] = ['leave.s', 'b1']; OPS[0xDF] = ['stind.i', '']; OPS[0xE0] = ['conv.u', ''];
const OP2 = { 0: ['arglist', ''], 1: ['ceq', ''], 2: ['cgt', ''], 3: ['cgt.un', ''], 4: ['clt', ''], 5: ['clt.un', ''], 6: ['ldftn', 't'], 7: ['ldvirtftn', 't'], 9: ['ldarg', 'u2'], 10: ['ldarga', 'u2'], 11: ['starg', 'u2'], 12: ['ldloc', 'u2'], 13: ['ldloca', 'u2'], 14: ['stloc', 'u2'], 15: ['localloc', ''], 17: ['endfilter', ''], 18: ['unaligned.', 'u1'], 19: ['volatile.', ''], 20: ['tail.', ''], 21: ['initobj', 't'], 22: ['constrained.', 't'], 23: ['cpblk', ''], 24: ['initblk', ''], 26: ['rethrow', ''], 28: ['sizeof', 't'], 29: ['refanytype', ''], 30: ['readonly.', ''] };

function disasm(m, method) {
  const b = m.b; if (!method.rva) return ['  (no body)'];
  let o = m.rva(method.rva); if (o < 0) return ['  (rva unmapped)'];
  let codeLen, h = b[o];
  if ((h & 3) === 2) { codeLen = h >> 2; o += 1; } else { codeLen = b.readUInt32LE(o + 4); o += (b.readUInt16LE(o) >> 12) * 4; }
  const out = []; const start = o, end = o + codeLen;
  while (o < end) {
    const at = o - start; let c = b[o++], op;
    if (c === 0xFE) { op = OP2[b[o++]]; } else op = OPS[c];
    if (!op) { out.push(`  ${at.toString(16).padStart(4, '0')}: ??? ${c.toString(16)}`); break; }
    let arg = '';
    switch (op[1]) {
      case 'u1': arg = b[o]; o += 1; break; case 'u2': arg = b.readUInt16LE(o); o += 2; break; case 'i1': arg = b.readInt8(o); o += 1; break;
      case 'i4': arg = b.readInt32LE(o); o += 4; break; case 'i8': arg = b.readBigInt64LE(o).toString(); o += 8; break; case 'r4': arg = b.readFloatLE(o); o += 4; break; case 'r8': arg = b.readDoubleLE(o); o += 8; break;
      case 'b1': { const d = b.readInt8(o); o += 1; arg = '-> ' + (o - start + d).toString(16); break; }
      case 'b4': { const d = b.readInt32LE(o); o += 4; arg = '-> ' + (o - start + d).toString(16); break; }
      case 't': case 'sig': { const t = b.readUInt32LE(o); o += 4; arg = m.tok(t); break; }
      case 'sw': { const n = b.readUInt32LE(o); o += 4; const base = o + n * 4; const l = []; for (let i = 0; i < n; i++) { l.push((base - start + b.readInt32LE(o)).toString(16)); o += 4; } arg = l.join(','); break; }
    }
    out.push(`  ${at.toString(16).padStart(4, '0')}: ${op[0].padEnd(11)} ${arg}`);
  }
  return out;
}
module.exports = { load, disasm };
