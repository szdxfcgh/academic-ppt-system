#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 1B-3B5R2B — deterministic in-place ZIP metadata normalization.

Pure stdlib. Rewrites a generated PPTX archive so that EVERY member carries
the documented constant DOS date/time; member names, ordering, uncompressed
payload bytes, directory/file distinction, compression method and external
attributes are preserved. No OOXML payload parsing or mutation.

FAIL-CLOSED on archives outside the currently qualified profile (R2A
evidence): ZIP_STORED members, flag bits == 0, no encryption, no duplicate
member names, no entry/archive comments. Any unexpected surface aborts
without claiming deterministic support.

Never extracts entries to filesystem paths (no ZIP traversal surface).
Writes a temp sibling file in the same directory and atomically replaces the
target only after structural validation.

Usage: normalize_pptx_zip.py <pptx-path>
Exit 0 on success; non-zero on any failure (no success fabrication).
"""
import hashlib
import os
import sys
import zipfile

FIXED_ZIP_DATETIME = (1980, 1, 1, 0, 0, 0)
TEMP_SUFFIX = ".normtmp"


def fail(reason):
    sys.stderr.write("NORMALIZATION_FAILED: %s\n" % str(reason)[:200])
    sys.exit(1)


def main():
    if len(sys.argv) != 2:
        fail("usage: normalize_pptx_zip.py <pptx-path>")
    target = sys.argv[1]
    if not os.path.isfile(target):
        fail("target file missing: %s" % os.path.basename(target))

    # 1) read original archive (malformed ZIP / missing file fails closed here)
    try:
        zin = zipfile.ZipFile(target, "r")
    except Exception as exc:
        fail("cannot open archive: %s" % exc)
    try:
        if zin.comment:
            fail("archive comment outside qualified profile")
        infos = zin.infolist()
        names = [i.filename for i in infos]
        if len(set(names)) != len(names):
            fail("duplicate member names")
        payloads = {}
        shas = {}
        for info in infos:
            if info.flag_bits != 0:
                fail("member %s flag_bits=%d outside qualified profile" % (info.filename, info.flag_bits))
            if info.comment:
                fail("member %s comment outside qualified profile" % info.filename)
            if info.compress_type != zipfile.ZIP_STORED:
                fail("member %s compress_type=%d outside qualified profile" % (info.filename, info.compress_type))
            try:
                payload = zin.read(info.filename)
            except Exception as exc:
                fail("member %s unreadable (encrypted or corrupt): %s" % (info.filename, exc))
            payloads[info.filename] = payload
            shas[info.filename] = hashlib.sha256(payload).digest()
    finally:
        zin.close()

    # 2) deterministic rewrite to a temp sibling in the SAME directory
    tmp = target + TEMP_SUFFIX
    try:
        if os.path.exists(tmp):
            os.unlink(tmp)
        zout = zipfile.ZipFile(tmp, "w")
        try:
            for info in infos:
                ni = zipfile.ZipInfo(info.filename, date_time=FIXED_ZIP_DATETIME)
                ni.compress_type = zipfile.ZIP_STORED
                ni.extra = info.extra
                ni.external_attr = info.external_attr
                ni.flag_bits = 0
                ni.comment = b""
                zout.writestr(ni, payloads[info.filename])
            zout.comment = b""
        finally:
            zout.close()
    except Exception as exc:
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except Exception:
            pass
        fail("rewrite failed: %s" % exc)

    # 3) validate BEFORE replace: opens, count, ordered names, no duplicates,
    #    no corrupt member, every payload byte-identical
    try:
        zcheck = zipfile.ZipFile(tmp, "r")
        try:
            new_names = [i.filename for i in zcheck.infolist()]
            if len(new_names) != len(names):
                fail("member count changed after rewrite")
            if new_names != names:
                fail("member names or ordering changed after rewrite")
            if len(set(new_names)) != len(new_names):
                fail("duplicate member names after rewrite")
            bad = zcheck.testzip()
            if bad is not None:
                fail("corrupt member after rewrite: %s" % bad)
            for name in names:
                if hashlib.sha256(zcheck.read(name)).digest() != shas[name]:
                    fail("payload bytes changed for member: %s" % name)
        finally:
            zcheck.close()
    except Exception as exc:
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except Exception:
            pass
        fail("validation failed: %s" % exc)

    # 4) atomic replace
    try:
        os.replace(tmp, target)
    except Exception as exc:
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except Exception:
            pass
        fail("atomic replace failed: %s" % exc)

    sys.stdout.write("NORMALIZED %s\n" % os.path.basename(target))


if __name__ == "__main__":
    main()
