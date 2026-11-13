param(
  [switch]$Attach,
  [string]$Log = '',
  [string]$ExtraArgs = '',
  [string]$XeniaDir = '',
  [string]$Iso = ''
)
# Starts The Sims 3 Pets in Xenia and installs the mod menu into the running game's memory.
# Nothing on disk is changed: the game file, Xenia and your saves are left alone.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$parent = Split-Path -Parent $here
if (-not $XeniaDir) { $XeniaDir = Join-Path $parent 'xenia' }
if (-not $Iso) {
  $found = Get-ChildItem -LiteralPath $parent -Filter '*.iso' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Sims.*3.*Pets' } | Select-Object -First 1
  if ($found) { $Iso = $found.FullName }
}

function Say([string]$Text) {
  if ($Log) { Add-Content -LiteralPath $Log -Value ((Get-Date).ToString('HH:mm:ss ') + $Text) } else { Write-Host $Text }
}
function Stop-WithMessage([string]$Text) { Say $Text; if (-not $Log) { Read-Host 'Press Enter to close' | Out-Null }; exit 1 }

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
public static class ModLoader {
  [StructLayout(LayoutKind.Sequential)] struct MBI { public ulong Base, AllocBase; public uint AllocProt, pad0; public ulong Size; public uint State, Protect, Type, pad1; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint a, bool b, int pid);
  [DllImport("kernel32.dll")] static extern IntPtr VirtualQueryEx(IntPtr h, ulong addr, out MBI m, IntPtr len);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr h, ulong addr, byte[] buf, IntPtr n, out IntPtr got);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool WriteProcessMemory(IntPtr h, ulong addr, byte[] buf, IntPtr n, out IntPtr done);
  public class Patch { public int Off, Len; public string Hash; public byte[] Data; }
  static IntPtr H;
  public static void Open(int pid) { H = OpenProcess(0x0438, false, pid); if (H == IntPtr.Zero) throw new Exception("Could not open Xenia (error " + Marshal.GetLastWin32Error() + ")"); }
  static byte[] Read(ulong a, int n) { var b = new byte[n]; IntPtr g; return ReadProcessMemory(H, a, b, (IntPtr)n, out g) && (long)g == n ? b : null; }
  static bool Same(byte[] a, byte[] b) { if (a == null || b == null || a.Length != b.Length) return false; for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false; return true; }
  static string Sha(byte[] b) { if (b == null) return ""; using (var s = SHA256.Create()) return BitConverter.ToString(s.ComputeHash(b)).Replace("-", "").ToLowerInvariant(); }
  public static byte[] Hex(string s) { var d = new byte[s.Length / 2]; for (int i = 0; i < d.Length; i++) d[i] = Convert.ToByte(s.Substring(i * 2, 2), 16); return d; }
  public static List<ulong> FindImages(string probeHash, int probeLen, int probeOff, ulong lo, ulong hi) {
    var found = new List<ulong>(); var buf = new byte[32 * 1024 * 1024]; ulong a = lo;
    while (a < hi) {
      MBI m; if (VirtualQueryEx(H, a, out m, (IntPtr)Marshal.SizeOf(typeof(MBI))) == IntPtr.Zero) break;
      ulong next = m.Base + m.Size;
      if (m.State == 0x1000 && (m.Protect & 0x100) == 0 && (m.Protect & 0xEE) != 0) {
        ulong start = Math.Max(m.Base, a);
        for (ulong p = start; p < next; p += (ulong)buf.Length - 16) {
          long want = (long)Math.Min((ulong)buf.Length, next - p); IntPtr got;
          if (!ReadProcessMemory(H, p, buf, (IntPtr)want, out got)) continue;
          for (long i = 0; i + 4 < (long)got; i += 4) {
            if (buf[i] != 0x4D || buf[i+1] != 0x5A || buf[i+2] != 0x90 || buf[i+3] != 0x00) continue;
            ulong at = p + (ulong)i;
            if (Sha(Read(at + (ulong)probeOff, probeLen)) == probeHash && !found.Contains(at)) found.Add(at);
          }
        }
      }
      a = next;
    }
    return found;
  }
  // 0 = untouched and safe to patch, 1 = already patched, 2 = partly written, -1 = this is not the code the mod was made for.
  public static int Check(ulong image, Patch[] ps) {
    int fresh = 0, done = 0;
    foreach (var p in ps) { var cur = Read(image + (ulong)p.Off, p.Len); if (Same(cur, p.Data)) done++; else if (Sha(cur) == p.Hash) fresh++; else return -1; }
    if (done == ps.Length) return 1; if (fresh == ps.Length) return 0; return 2;
  }
  public static bool Apply(ulong image, Patch[] ps) {
    foreach (var p in ps) { IntPtr n; if (!WriteProcessMemory(H, image + (ulong)p.Off, p.Data, (IntPtr)p.Data.Length, out n) || (long)n != p.Data.Length) return false; }
    return true;
  }
}
'@

$spec = Get-Content -LiteralPath (Join-Path $here 'mod_patches.json') -Raw | ConvertFrom-Json
$patches = [ModLoader+Patch[]]@(foreach ($p in $spec.patches) { $x = [ModLoader+Patch]::new(); $x.Off = $p.o; $x.Len = $p.n; $x.Hash = $p.h; $x.Data = [ModLoader]::Hex($p.d); $x })

if ($Attach) {
  Say 'Waiting for Xenia...'
  while (-not ($proc = Get-Process xenia_canary -ErrorAction SilentlyContinue | Select-Object -First 1)) { Start-Sleep -Milliseconds 500 }
} else {
  $exe = Join-Path $XeniaDir 'xenia_canary.exe'
  if (-not (Test-Path -LiteralPath $exe)) { Stop-WithMessage "Could not find Xenia at: $exe`nPut this folder next to your xenia folder." }
  if (-not $Iso -or -not (Test-Path -LiteralPath $Iso)) { Stop-WithMessage "Could not find the game. Put your Sims 3 Pets .iso next to this folder (its name must include Sims, 3 and Pets)." }
  if (Get-Process xenia_canary -ErrorAction SilentlyContinue) { Stop-WithMessage 'Xenia is already open. Close it first, then run this again.' }
  Say 'Starting The Sims 3 Pets...'
  $proc = Start-Process -FilePath $exe -WorkingDirectory $XeniaDir -ArgumentList ("`"$Iso`" " + $ExtraArgs) -PassThru
}
[ModLoader]::Open($proc.Id)
Say 'Waiting for the game to load. Leave this window open while you play.'

# The game's code has always landed in this part of memory; the wider search is only a fallback.
$likelyLo = [uint64]0x1A0000000; $likelyHi = [uint64]0x1C0000000; $allLo = [uint64]0x100000000; $allHi = [uint64]0x200000000
$started = Get-Date
$known = @{}
$installed = $false
$lastScan = [datetime]::MinValue
while (-not $proc.HasExited) {
  # Going back to the main menu makes the game reload its code at the same address, which removes the mod.
  # Re-check every copy already patched, and put the mod back whenever one turns up unpatched again.
  foreach ($image in @($known.Keys)) {
    if ($known[$image] -ne 'patched') { continue }
    if ([ModLoader]::Check($image, $patches) -eq 0) {
      if ([ModLoader]::Apply($image, $patches)) { Say 'The game reloaded its code, so the mod menu was installed again.' }
    }
  }
  # Look for copies not seen yet: every 3 seconds until the first install, then once a minute.
  $now = Get-Date
  if (($now - $lastScan).TotalSeconds -ge $(if ($installed) { 60 } else { 3 })) {
    $lastScan = $now
    $lo = $likelyLo; $hi = $likelyHi
    if (-not $installed -and ($now - $started).TotalSeconds -gt 180) { $lo = $allLo; $hi = $allHi }
    foreach ($image in [ModLoader]::FindImages($spec.probeSha256, [int]$spec.probeLen, [int]$spec.probeOff, $lo, $hi)) {
      if ($known.ContainsKey($image)) { continue }
      $state = [ModLoader]::Check($image, $patches)
      if ($state -eq 0) {
        if ([ModLoader]::Apply($image, $patches)) {
          $known[$image] = 'patched'; $installed = $true
          Say 'Mod menu installed. In the game, hold LT and press A on the ground or on a Sim.'
        } else { Say 'Could not write to the game''s memory.' }
      } elseif ($state -eq 1) { $known[$image] = 'patched'; $installed = $true }
      elseif ($state -eq -1) { Say 'This copy of the game does not match the version this mod was made for, so nothing was changed.'; $known[$image] = 'other' }
    }
  }
  Start-Sleep -Seconds 2
}
Say 'The game has closed.'
