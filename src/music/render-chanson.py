"""Render the recorded-instrument arrangement. See SOURCES.md for the three sample banks."""
import argparse
import functools
import json
import re
import warnings
from pathlib import Path

import lameenc
import numpy as np
from scipy import signal
from scipy.io import wavfile


RATE = 44100
CHORDS = {
    "Dm": (38, 50, 57, 62, 65), "Gm": (43, 50, 55, 58, 62),
    "A7": (45, 52, 55, 61, 64), "Bb": (34, 53, 58, 62, 65),
    "F": (41, 53, 57, 60, 65), "C7": (36, 52, 55, 58, 64),
    "Ed": (40, 52, 55, 58, 62), "D7": (38, 50, 54, 57, 60),
    "Gm6": (43, 52, 55, 58, 62)
}
ORDER = ("intro", "refrain", "verse", "guitar", "refrain", "coda")
PITCH_CLASSES = {"C":0, "D":2, "E":4, "F":5, "G":7, "A":9, "B":11}


def note_number(name, octave_offset):
    letter, sharp, octave = re.fullmatch(r"([A-G])(#?)(-?\d+)", name).groups()
    return (int(octave) + octave_offset) * 12 + PITCH_CLASSES[letter] + bool(sharp)


class Band:
    def __init__(self, banks, seconds):
        self.rng = np.random.default_rng(1937)
        self.mix = np.zeros((round((seconds + 2) * RATE), 2), dtype=np.float32)
        self.samples = {"accordion": {}, "guitar": {}, "bass": {}}
        accordion = next(banks.glob("*Accordion*/*.sfz"))
        for name, root, tune in re.findall(
            r"<region> sample=([^\n]+?\.wav) pitch_keycenter=(\d+) lokey=\d+ hikey=\d+ tune=(-?\d+)",
            accordion.read_text().split("trigger=release")[0]
        ):
            self.samples["accordion"][int(root)] = [(accordion.parent/name, int(tune))]
        for path in sorted(banks.glob("SpanishClassicalGuitar*/samples/*.wav")):
            self.samples["guitar"][note_number(path.stem, 1)] = [(path, 0)]
        for path in sorted((banks/"contrabass").glob("*_v1_rr*.wav")):
            name = path.stem.split("_")[2]
            self.samples["bass"].setdefault(note_number(name, 2), []).append((path, 0))
        if any(not index for index in self.samples.values()):
            raise ValueError("The three unpacked WAV sample banks are required.")

    @staticmethod
    @functools.lru_cache(maxsize=128)
    def sample(path, instrument):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", wavfile.WavFileWarning)
            rate, raw = wavfile.read(path)
        wave = raw.astype(np.float32) / float(np.iinfo(raw.dtype).max)
        if wave.ndim == 1:
            wave = np.column_stack((wave, wave))
        cutoff = {"accordion":100, "guitar":74, "bass":38}[instrument]
        wave = signal.sosfilt(signal.butter(2, cutoff, "highpass", fs=rate, output="sos"), wave, axis=0)
        # Preserve the player's onset. Remove only leading room tone.
        short = np.max(np.abs(wave[:rate]), axis=1)
        onset = np.flatnonzero(short > np.max(short) * .035)
        if len(onset):
            wave = wave[max(0, onset[0] - round(.006 * rate)):]
        block = round(.022 * rate)
        length = min(len(wave)//block, 42)
        rms = np.sqrt(np.mean(wave[:length*block].reshape(length,block,2)**2,axis=(1,2)))
        return rate, np.asarray(wave / max(.005, np.percentile(rms, 85)), dtype=np.float32)

    def play(self, instrument, pitch, start, duration, gain, *, legato=False, pan=None):
        roots = self.samples[instrument]
        closest = min(roots, key=lambda value: abs(value-pitch))
        options = roots[closest]
        path, tuning = options[self.rng.integers(len(options))]
        rate, source = self.sample(path, instrument)
        speed = 2 ** ((pitch - closest + tuning/100) / 12) * rate/RATE
        release = {"accordion":.075, "guitar":.14, "bass":.18}[instrument]
        if duration < .13:
            release *= .36
        count = round((duration + release) * RATE)
        # Adjacent legato notes begin with the bellows already in motion.
        offset = self.rng.uniform(.048,.095)*rate if legato and instrument=="accordion" else 0
        pos = np.arange(count)*speed + offset
        pos = pos[pos < len(source)-1]
        anchors = pos.astype(int)
        blend = (pos-anchors)[:,None]
        take = source[anchors] * (1-blend) + source[anchors+1] * blend
        time = np.arange(len(take)) / RATE
        attack = .012 if legato else {"accordion":.035, "guitar":.003, "bass":.005}[instrument]
        env = np.minimum(1,time/attack) * np.maximum(0,1-np.maximum(0,time-duration)/release)**2
        if instrument == "accordion":
            env *= np.interp(time, [0,duration*.38,duration,duration+release], [.86,1.03,.83,.76])
        # Retain stereo ambience from the instruments, then seat the trio across the room.
        middle = take.mean(axis=1)
        side = (take[:,0]-take[:,1])*.26
        if pan is None:
            pan = {"accordion":-.08, "guitar":.29, "bass":-.20}[instrument]
        left = (middle+side)*np.sqrt(1-pan)
        right = (middle-side)*np.sqrt(1+pan)
        take = np.column_stack((left,right)) * (gain*env)[:,None]
        begin = max(0,round(start*RATE))
        self.mix[begin:begin+len(take)] += take


def arrange(banks):
    score = json.loads(Path(__file__).with_name("petit-pollen-score.json").read_text())
    bars = [(section, i, bar) for section in ORDER for i,bar in enumerate(score[section])]
    beats = []
    for index,(section, phrase_bar, _) in enumerate(bars):
        tempo = {"intro":109, "refrain":115, "verse":111, "guitar":114, "coda":109}[section]
        # Let each phrase breathe into its cadence; ease into the final double bar.
        tempo -= (2 if phrase_bar % 4 == 3 else 0) + (4 if index >= len(bars)-2 else 0)
        beats.append(60/tempo * (1 + .006*np.sin(index*1.63)))
    starts = np.r_[0, np.cumsum(beats)*3]
    band = Band(banks, starts[-1])
    rng = band.rng
    for index, (section, slot, (chord, *line)) in enumerate(bars):
        start, beat = starts[index], beats[index]
        root, *voicing = CHORDS[chord]
        intimate = section == "guitar"
        returning = section == "refrain" and index > 20
        lift = 1.07 if returning else .90 if section == "intro" else 1.
        low = root + (7 if index%4==1 and bars[index-1][2][0]==chord else 0)
        band.play("bass", low, start + .017, beat*(1.31 if slot%2 else 1.61), .106*lift)
        if slot%4 == 3 or (returning and slot%2):
            next_root = CHORDS[bars[(index+1)%len(bars)][2][0]][0]
            pickup = next_root + (1 if root>next_root else -1)
            band.play("bass",pickup,start+2.51*beat,beat*.36,.064)
        elif slot%4==2:
            band.play("bass",root+7,start+2.12*beat,beat*.60,.068)
        # Guitar accompaniment alternates a small strum, an upstroke and occasional arpeggios.
        if not intimate:
            if section=="intro" or (section=="verse" and slot in (2,5)) or (section=="coda" and slot==3):
                for k, p in enumerate(voicing):
                    band.play("guitar",p,start+(.10+.68*k)*beat,.90*beat,.051*lift)
            else:
                for pulse in (1,2):
                    muted = (pulse+slot)%3 != 0
                    notes = voicing[:-1] if pulse==1 else list(reversed(voicing[1:]))
                    for k,p in enumerate(notes):
                        at = start + beat*(pulse + (.018 if pulse==1 else .041)) + k*.012
                        gate = beat*(.32 if muted else .62)
                        band.play("guitar",p,at,gate,(.050 if pulse==1 else .040)*lift*rng.uniform(.92,1.08))
        else:
            # While the guitarist takes the melody, reeds hold quiet two-note responses.
            for p in voicing[1:3]:
                band.play("accordion",p,start+beat*.83,beat*(1.62 if slot%2==0 else 1.07),.030)
        part = "guitar" if intimate else "accordion"
        cursor = 0.
        for n,(pitch,count) in enumerate(line):
            if pitch:
                start_note = start+cursor*beat+rng.uniform(.000,.012)
                length = count*beat
                connected = not intimate and n>0 and line[n-1][0] and abs(pitch-line[n-1][0])<=4
                separation = .985 if connected else .90
                if n==len(line)-1 or (count==1 and slot%4==0 and n<2):
                    separation = .83
                emphasis = (1.13 if n==0 else 1.) * (1.04 if count>=1.5 else .97)
                gain = (.154 if intimate else .118)*lift*emphasis*rng.uniform(.96,1.04)
                if (returning or section=="guitar") and slot in (2,5) and n==0:
                    band.play(part,pitch-2,max(0,start_note-.057),.050,gain*.65,legato=True)
                band.play(part,pitch,start_note,length*separation,gain,legato=bool(connected))
                if returning and slot in (2,5,7) and count>=1:
                    below = max((p for p in voicing if p < pitch-2),default=pitch-5)
                    band.play("accordion",below,start_note+.015,length*.86,.034,legato=True)
            cursor += count
        assert abs(cursor-3)<.00001
    return band.mix, starts


def room_mix(dry, length):
    # A short stereo room: distinct early wall returns and a damped, diffuse tail.
    rng = np.random.default_rng(418)
    out = np.copy(dry)
    for channel, early in enumerate(((.014,.029,.051),(.019,.034,.057))):
        times = np.arange(round(RATE*.70))/RATE
        noise = rng.normal(0,1,len(times))
        impulse = signal.sosfilt(signal.butter(2,3800,fs=RATE,output="sos"),noise)
        impulse *= np.exp(-times/0.106)*np.minimum(times/.023,1)
        impulse *= .105/np.linalg.norm(impulse)
        for delay, gain in zip(early,(.076,.048,.029)):
            impulse[round(delay*RATE)] += gain
        send = dry[:,channel]*.70 + dry[:,1-channel]*.30
        out[:,channel] += signal.oaconvolve(send,impulse,mode="full")[:len(out)]
    n = round(length*RATE)
    tail = min(RATE,len(out)-n)
    out[:tail] += out[n:n+tail]
    out = out[:n]
    # Leave a little air at the repeat even on players with MP3 padding.
    out[:530] *= np.linspace(0,1,530)[:,None]
    out[-860:] *= np.linspace(1,0,860)[:,None]
    peak = np.max(np.abs(out))
    rms = np.sqrt(np.mean(out**2))
    out *= min(.835/peak,.125/rms)
    return np.int16(np.clip(out,-1,1)*32767)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("banks",type=Path)
    parser.add_argument("mp3",type=Path)
    parser.add_argument("--preview",type=Path)
    args = parser.parse_args()
    dry, starts = arrange(args.banks)
    pcm = room_mix(dry, starts[-1])
    encoder = lameenc.Encoder()
    encoder.set_in_sample_rate(RATE)
    encoder.set_channels(2)
    encoder.set_bit_rate(144)
    encoder.set_quality(2)
    args.mp3.write_bytes(encoder.encode(pcm.tobytes())+encoder.flush())
    if args.preview:
        # Two-bar pickup, a full refrain and the first phrase of the next verse.
        clip = pcm[round(starts[2]*RATE):round(starts[14]*RATE)].astype(float)
        clip[:882] *= np.linspace(0,1,882)[:,None]
        clip[-22050:] *= np.linspace(1,0,22050)[:,None]
        wavfile.write(args.preview,RATE,clip.astype(np.int16))
    print(f"{len(pcm)/RATE:.2f} s, {len(pcm)} stereo frames, peak {abs(pcm).max()/32767:.3f}")
