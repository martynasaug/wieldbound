# Synthesises the game's sound effects as 16-bit mono WAVs.
#
# Generated rather than downloaded: the CC0 sound packs worth using are
# large downloads of mostly-irrelevant clips, and a handful of short
# chiptune-style blips is a few lines of arithmetic. It also means the
# whole palette stays consistent and is trivially extensible for the
# spells/skills that don't exist yet - add an entry, re-run, done.

# Resolves from this script's location so the repo works wherever it is cloned.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root "client\public\assets\sfx"
New-Item -ItemType Directory -Force -Path $assets | Out-Null
$RATE = 22050

function Write-Wav([double[]]$samples, [string]$name) {
  $n = $samples.Length
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  $ascii = [System.Text.Encoding]::ASCII
  $bw.Write($ascii.GetBytes('RIFF'))
  $bw.Write([int](36 + $n * 2))
  $bw.Write($ascii.GetBytes('WAVE'))
  $bw.Write($ascii.GetBytes('fmt '))
  $bw.Write([int]16)
  $bw.Write([int16]1)              # PCM
  $bw.Write([int16]1)              # mono
  $bw.Write([int]$script:RATE)
  $bw.Write([int]($script:RATE * 2))
  $bw.Write([int16]2)
  $bw.Write([int16]16)
  $bw.Write($ascii.GetBytes('data'))
  $bw.Write([int]($n * 2))
  foreach ($s in $samples) {
    $v = $s
    if ($v -gt 1.0) { $v = 1.0 }
    if ($v -lt -1.0) { $v = -1.0 }
    $bw.Write([int16][int]($v * 32000))
  }
  $bw.Flush()
  $path = Join-Path $script:assets $name
  [System.IO.File]::WriteAllBytes($path, $ms.ToArray())
  $bw.Dispose(); $ms.Dispose()
  "{0,-14} {1,6} samples  {2:N2}s" -f $name, $n, ($n / [double]$script:RATE)
}

$rand = New-Object System.Random(4242)
function NoiseS { return ($script:rand.NextDouble() * 2.0 - 1.0) }
# exponential decay envelope with a short attack, so nothing clicks on
function Env([double]$t, [double]$dur, [double]$decay) {
  $attack = 0.006
  if ($t -lt $attack) { return $t / $attack }
  return [Math]::Exp(-$decay * ($t - $attack) / $dur)
}
function SquareW([double]$phase) { if (($phase % (2 * [Math]::PI)) -lt [Math]::PI) { return 1.0 } else { return -1.0 } }

function New-Buffer([double]$dur) { return New-Object 'double[]' ([int]($dur * $script:RATE)) }

# --- swing: airy whoosh, lowpassed noise swelling then cutting ---------
$dur = 0.20; $buf = New-Buffer $dur; $prev = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $n = NoiseS
  $prev = $prev * 0.72 + $n * 0.28      # one-pole lowpass -> "air" not "hiss"
  $swell = [Math]::Sin([Math]::PI * ($t / $dur))
  $buf[$i] = $prev * $swell * 0.5
}
Write-Wav $buf "swing.wav"

# --- hit: square thump sliding down, with a noise transient -----------
$dur = 0.16; $buf = New-Buffer $dur; $ph = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $f = 320 - 230 * ($t / $dur)
  $ph += 2 * [Math]::PI * $f / $RATE
  $e = Env $t $dur 5.0
  $transient = 0.0
  if ($t -lt 0.03) { $transient = (NoiseS) * (1 - $t / 0.03) * 0.5 }
  $buf[$i] = ((SquareW $ph) * 0.42 + $transient) * $e
}
Write-Wav $buf "hit.wav"

# --- crit: brighter, two stacked squares, longer tail -----------------
$dur = 0.32; $buf = New-Buffer $dur; $ph = 0.0; $ph2 = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $f = 540 - 300 * ($t / $dur)
  $ph += 2 * [Math]::PI * $f / $RATE
  $ph2 += 2 * [Math]::PI * ($f * 1.5) / $RATE
  $e = Env $t $dur 4.0
  $transient = 0.0
  if ($t -lt 0.04) { $transient = (NoiseS) * (1 - $t / 0.04) * 0.55 }
  $buf[$i] = ((SquareW $ph) * 0.34 + (SquareW $ph2) * 0.2 + $transient) * $e
}
Write-Wav $buf "crit.wav"

# --- miss: soft dull puff ---------------------------------------------
$dur = 0.14; $buf = New-Buffer $dur; $prev = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $prev = $prev * 0.86 + (NoiseS) * 0.14
  $buf[$i] = $prev * (Env $t $dur 6.0) * 0.3
}
Write-Wav $buf "miss.wav"

# --- hurt: the player getting hit; low and blunt ----------------------
$dur = 0.24; $buf = New-Buffer $dur; $ph = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $f = 190 - 120 * ($t / $dur)
  $ph += 2 * [Math]::PI * $f / $RATE
  $e = Env $t $dur 4.5
  $buf[$i] = ((SquareW $ph) * 0.4 + (NoiseS) * 0.18) * $e
}
Write-Wav $buf "hurt.wav"

# --- die: monster defeated; long slide down ---------------------------
$dur = 0.42; $buf = New-Buffer $dur; $ph = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $f = 300 * [Math]::Exp(-2.6 * ($t / $dur))
  $ph += 2 * [Math]::PI * $f / $RATE
  $e = Env $t $dur 3.2
  $buf[$i] = ((SquareW $ph) * 0.34 + (NoiseS) * 0.1) * $e
}
Write-Wav $buf "die.wav"

# --- gather: soft pluck for a completed resource tick ------------------
$dur = 0.13; $buf = New-Buffer $dur; $ph = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $ph += 2 * [Math]::PI * 700 / $RATE
  $buf[$i] = [Math]::Sin($ph) * (Env $t $dur 7.0) * 0.34
}
Write-Wav $buf "gather.wav"

# --- levelup: rising arpeggio -----------------------------------------
$notes = @(523.25, 659.25, 783.99, 1046.5)
$noteDur = 0.13; $dur = $noteDur * $notes.Count; $buf = New-Buffer $dur; $ph = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $idx = [int]([Math]::Floor($t / $noteDur))
  if ($idx -ge $notes.Count) { $idx = $notes.Count - 1 }
  $ph += 2 * [Math]::PI * $notes[$idx] / $RATE
  $local = $t - $idx * $noteDur
  $buf[$i] = (SquareW $ph) * (Env $local $noteDur 3.5) * 0.26
}
Write-Wav $buf "levelup.wav"

# --- cast: rising shimmer, reserved for spells ------------------------
$dur = 0.36; $buf = New-Buffer $dur; $ph = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $f = 220 + 700 * ($t / $dur)
  $ph += 2 * [Math]::PI * $f / $RATE
  $trem = 0.75 + 0.25 * [Math]::Sin(2 * [Math]::PI * 22 * $t)
  $buf[$i] = [Math]::Sin($ph) * $trem * (Env $t $dur 2.2) * 0.3
}
Write-Wav $buf "cast.wav"

# --- heal: gentle two-partial chime -----------------------------------
$dur = 0.5; $buf = New-Buffer $dur; $ph = 0.0; $ph2 = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $ph += 2 * [Math]::PI * 880 / $RATE
  $ph2 += 2 * [Math]::PI * 1318.5 / $RATE
  $e = Env $t $dur 3.0
  $buf[$i] = ([Math]::Sin($ph) * 0.28 + [Math]::Sin($ph2) * 0.16) * $e
}
Write-Wav $buf "heal.wav"

# --- bow: bowstring release, a filtered noise transient over a low twang ---
# A bow going "whoosh" like a sword was the loudest thing wrong with ranger
# combat: the release is a snap, not a swing.
$dur = 0.16; $buf = New-Buffer $dur; $prev = 0.0; $ph = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  $prev = $prev * 0.55 + (NoiseS) * 0.45     # brighter than swing's "air"
  $snap = $prev * [Math]::Exp(-38 * $t) * 0.55
  $f = 190 - 90 * ($t / $dur)                # string pitch falling away
  $ph += 2 * [Math]::PI * $f / $RATE
  $twang = [Math]::Sin($ph) * [Math]::Exp(-16 * $t) * 0.3
  $buf[$i] = $snap + $twang
}
Write-Wav $buf "bow.wav"

# --- beam: a wand's zap, bright and electrical ------------------------
$dur = 0.18; $buf = New-Buffer $dur; $ph = 0.0
for ($i = 0; $i -lt $buf.Length; $i++) {
  $t = $i / [double]$RATE
  # Vibrato around a high carrier is what separates "zap" from "beep".
  $f = 1250 + 260 * [Math]::Sin(2 * [Math]::PI * 60 * $t) - 500 * ($t / $dur)
  $ph += 2 * [Math]::PI * $f / $RATE
  $tone = ([Math]::Sin($ph) * 0.7 + (SquareW $ph) * 0.3)
  $buf[$i] = $tone * [Math]::Exp(-14 * $t) * 0.26
}
Write-Wav $buf "beam.wav"

"---"
"wrote to $assets"
