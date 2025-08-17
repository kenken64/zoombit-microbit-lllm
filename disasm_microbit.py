import sys
from pathlib import Path
from typing import Iterable

ALLOWED_TYPES = {"00", "01", "02", "03", "04", "05"}

HEADER = """
This script filters non-standard Intel HEX record types (e.g., micro:bit universal HEX type 0x0A),
then converts to BIN and disassembles ARM Thumb (Cortex-M0/M0+) using Capstone.

Usage:
  python disasm_microbit.py <input.hex> [out_prefix]
Outputs:
  <out_prefix>.bin
  <out_prefix>_disasm.asm
""".strip()


def filter_hex_lines(lines: Iterable[str]) -> Iterable[str]:
    for ln in lines:
        if not ln:
            continue
        if ln[0] != ":":
            # passthrough anything unexpected
            continue
        if len(ln) < 11:
            continue
        rectype = ln[7:9]
        if rectype in ALLOWED_TYPES:
            yield ln
        else:
            # skip non-standard record types (e.g., 0A in micro:bit universal hex)
            continue


def main(argv):
    try:
        from intelhex import IntelHex
    except ImportError:
        print("ERROR: intelhex not installed. pip install intelhex", file=sys.stderr)
        return 2
    try:
        from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB, CS_MODE_MCLASS, CS_MODE_LITTLE_ENDIAN
    except ImportError:
        print("ERROR: capstone not installed. pip install capstone", file=sys.stderr)
        return 2

    if len(argv) < 2 or argv[1] in {"-h", "--help"}:
        print(HEADER)
        return 0

    inp = Path(argv[1]).resolve()
    if not inp.exists():
        print(f"ERROR: input not found: {inp}", file=sys.stderr)
        return 2

    out_prefix = Path(argv[2]) if len(argv) >= 3 else inp.with_suffix("")
    out_prefix = out_prefix.resolve()

    filtered_hex = out_prefix.with_suffix(".filtered.hex")
    bin_path = out_prefix.with_suffix(".bin")
    asm_path = out_prefix.parent / (out_prefix.name + "_disasm.asm")

    # Filter HEX lines to remove non-standard record types
    with inp.open("r", encoding="ascii", errors="ignore") as f_in, filtered_hex.open("w", encoding="ascii") as f_out:
        for line in filter_hex_lines(x.rstrip("\r\n") for x in f_in):
            f_out.write(line + "\n")

    # Load filtered HEX and extract binary per segment to avoid huge sparse gaps
    ih = IntelHex(str(filtered_hex))
    segments = ih.segments()

    try:
        from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB, CS_MODE_MCLASS, CS_MODE_LITTLE_ENDIAN
    except Exception:
        print("ERROR: capstone import failed unexpectedly", file=sys.stderr)
        return 2

    md = Cs(CS_ARCH_ARM, CS_MODE_THUMB | CS_MODE_MCLASS | CS_MODE_LITTLE_ENDIAN)
    md.detail = False

    any_done = False
    for idx, (seg_start, seg_end_excl) in enumerate(segments):
        size = seg_end_excl - seg_start
        if size <= 0:
            continue
        seg_bin = out_prefix.parent / f"{out_prefix.name}_seg{idx:02d}.bin"
        seg_asm = out_prefix.parent / f"{out_prefix.name}_seg{idx:02d}_disasm.asm"
        # Write only this contiguous segment
        ih.tobinfile(str(seg_bin), start=seg_start, size=size)
        code = Path(seg_bin).read_bytes()
        with seg_asm.open("w", encoding="utf-8") as f:
            f.write(f"; Base address: 0x{seg_start:08X}\n")
            f.write(f"; Size: {len(code)} bytes\n\n")
            for insn in md.disasm(code, seg_start):
                f.write(f"0x{insn.address:08X}:\t{insn.mnemonic}\t{insn.op_str}\n")
        print(f"SEG{idx:02d} BASE=0x{seg_start:08X} SIZE={size} -> BIN={seg_bin.name} ASM={seg_asm.name}")
        any_done = True

    if not any_done:
        print("No segments found in HEX after filtering.", file=sys.stderr)
        return 2

    # Also write a small summary file
    with (out_prefix.parent / f"{out_prefix.name}_segments.txt").open("w", encoding="utf-8") as f:
        for idx, (seg_start, seg_end_excl) in enumerate(segments):
            f.write(f"SEG{idx:02d}: 0x{seg_start:08X} - 0x{seg_end_excl-1:08X} (size {seg_end_excl-seg_start})\n")

    print("DONE")


if __name__ == "__main__":
    sys.exit(main(sys.argv))

