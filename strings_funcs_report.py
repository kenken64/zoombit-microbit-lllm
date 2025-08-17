import struct
from pathlib import Path
from typing import List, Tuple

# Simple ASCII strings extractor

def extract_strings(data: bytes, base_addr: int, min_len: int = 4) -> List[Tuple[int, str]]:
    out: List[Tuple[int, str]] = []
    start = None
    for i, b in enumerate(data + b"\x00"):  # sentinel to flush
        if 0x20 <= b <= 0x7E:  # printable ASCII
            if start is None:
                start = i
        else:
            if start is not None and i - start >= min_len:
                s = data[start:i].decode('ascii', errors='ignore')
                out.append((base_addr + start, s))
            start = None
    return out

# Heuristic function-start finder using Capstone (Thumb + M class)

def find_functions(data: bytes, base_addr: int) -> List[int]:
    try:
        from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB, CS_MODE_MCLASS, CS_MODE_LITTLE_ENDIAN
    except Exception:
        return []
    md = Cs(CS_ARCH_ARM, CS_MODE_THUMB | CS_MODE_MCLASS | CS_MODE_LITTLE_ENDIAN)
    md.detail = False
    starts: List[int] = []
    for insn in md.disasm(data, base_addr):
        m = insn.mnemonic
        op = insn.op_str
        # Common prologues on Cortex-M0 builds
        if m == 'push' and 'lr' in op:
            starts.append(insn.address)
        elif m == 'sub' and op.startswith('sp,'):
            # sometimes functions start with stack alloc first
            starts.append(insn.address)
    # dedupe while preserving order
    seen = set()
    uniq = []
    for a in starts:
        if a not in seen:
            uniq.append(a)
            seen.add(a)
    return uniq


def read_u32_le(b: bytes, off: int) -> int:
    return struct.unpack_from('<I', b, off)[0]


def main():
    project = Path(r"D:\Projects\microbit-zoombit")
    prefix = project / "microbit-rekabit-robot"

    # Collect segment BINs and infer base addresses from the segments summary file
    segments_txt = prefix.with_name(prefix.name + "_segments.txt")
    if not segments_txt.exists():
        print("Segments summary not found:", segments_txt)
        return 2

    seg_infos: List[Tuple[str, int]] = []  # (bin filename, base)
    lines = segments_txt.read_text(encoding='utf-8', errors='ignore').splitlines()
    for i, ln in enumerate(lines):
        # Format: SEGxx: 0xBASE - 0xEND (size N)
        ln = ln.strip()
        if not ln or not ln.startswith("SEG"):
            continue
        try:
            left, _rest = ln.split(':', 1)
            seg_id = left.strip()
            base_hex = ln.split()[1]  # token after ':' is like 0x00000000
            base = int(base_hex, 16)
        except Exception:
            continue
        bin_name = f"{prefix.name}_{seg_id.lower()}.bin".replace(':','')
        # our earlier naming used segNN, not "segxx:" text; generate accordingly
        # We know creation format: microbit-rekabit-robot_segNN.bin
        seg_num = seg_id[3:5]
        bin_name = f"{prefix.name}_seg{seg_num}.bin"
        seg_bin = project / bin_name
        if seg_bin.exists():
            seg_infos.append((str(seg_bin), base))

    strings_report = project / "strings_report.txt"
    funcs_report = project / "functions_report.txt"
    reset_report = project / "reset_vector.txt"

    with strings_report.open('w', encoding='utf-8') as fs, funcs_report.open('w', encoding='utf-8') as ff:
        for seg_bin, base in seg_infos:
            data = Path(seg_bin).read_bytes()
            # Strings
            strs = extract_strings(data, base)
            fs.write(f"# {Path(seg_bin).name} @ 0x{base:08X} (found {len(strs)} strings)\n")
            for addr, s in strs:
                fs.write(f"0x{addr:08X}: {s}\n")
            fs.write("\n")
            # Functions
            funcs = find_functions(data, base)
            ff.write(f"# {Path(seg_bin).name} @ 0x{base:08X} (heuristic function starts: {len(funcs)})\n")
            for addr in funcs:
                ff.write(f"0x{addr:08X}\n")
            ff.write("\n")

    # Reset vector from seg00 (vector table): initial SP and Reset handler
    seg0 = project / f"{prefix.name}_seg00.bin"
    if seg0.exists():
        d0 = seg0.read_bytes()
        if len(d0) >= 8:
            initial_sp = read_u32_le(d0, 0)
            reset = read_u32_le(d0, 4) & ~1  # clear Thumb bit
            with reset_report.open('w', encoding='utf-8') as fr:
                fr.write(f"Initial_SP = 0x{initial_sp:08X}\n")
                fr.write(f"Reset_Handler = 0x{reset:08X}\n")

    print("Wrote:")
    print(strings_report)
    print(funcs_report)
    print(reset_report)

if __name__ == '__main__':
    raise SystemExit(main())

