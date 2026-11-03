#!/usr/bin/env python3
# Packs a demo's staged folder for the site (see package_demo.sh), as the page downloads it
# (shell/demo-download.js):
#
#   python3 pack_demo.py <staged dir> <site dir> <pack list> [--trim-against <dir> ...]
#
# - With --trim-against (The First Encounter's demo, which is the engine's CD path): out of its
#   group files go the files that those folders (The Second Encounter's demo, the base package)
#   have too, loose or in their group files. Their files rank above the CD path's, so the engine
#   never reads these (UNZIPReadDirectoriesReverse_t() and ExpandFilePath_read() in the engine),
#   except the texts it reads from the CD path's own copies: The First Encounter's intro and
#   credits (OpenFromCDPath_t() in Credits.cpp and Player.es).
# - Group files are written with their files stored, not compressed: the download is compressed
#   as a whole instead, much better (xz), and the page keeps what it unpacks.
# - Each file goes to <site dir>/<path>.xz, in segments of SEGMENT bytes of the file, each its own
#   xz stream, so that a download can go on from any segment; or as it is to <site dir>/<path>,
#   when xz doesn't make it smaller.
# - <pack list>: JSON { segment, files: [{ path, size, xz?: [the segments' sizes] }] }, for
#   make_demo_list.mjs.

import argparse
import concurrent.futures
import io
import json
import lzma
import os
import re
import shutil
import zipfile

SEGMENT = 16 << 20
# (CRC32: what the page's decoder checks; the dictionary no bigger than a segment)
FILTERS = [{'id': lzma.FILTER_LZMA2, 'preset': 9 | lzma.PRESET_EXTREME, 'dict_size': SEGMENT}]
# what the engine reads from the CD path's own copies
READ_FROM_CD = re.compile(r'^data/(intro|credits[^/]*)\.txt$', re.I)


def names_in(folder):
    """The files a folder has, loose or in its group files (lower case, with slashes)."""
    names = set()
    for root, _, files in os.walk(folder):
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, folder).replace(os.sep, '/')
            names.add(rel.lower())
            if '/' not in rel and rel.lower().endswith('.gro'):
                with zipfile.ZipFile(full) as gro:
                    names.update(info.filename.replace('\\', '/').lower() for info in gro.infolist())
    return names


def stored_group(path, drop):
    """A group file with its files stored (not compressed), without those drop() says: bytes, removed."""
    out = io.BytesIO()
    removed = []
    with zipfile.ZipFile(path) as gro, zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as new:
        for info in gro.infolist():
            if info.is_dir():
                continue
            if drop(info.filename):
                removed.append(info)
                continue
            entry = zipfile.ZipInfo(info.filename, info.date_time)
            entry.external_attr = info.external_attr
            new.writestr(entry, gro.read(info), compress_type=zipfile.ZIP_STORED)
    return out.getvalue(), removed


def compress(data):
    return lzma.compress(data, format=lzma.FORMAT_XZ, check=lzma.CHECK_CRC32, filters=FILTERS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('staged')
    parser.add_argument('site')
    parser.add_argument('pack_list')
    parser.add_argument('--trim-against', nargs='*', default=[])
    args = parser.parse_args()

    above = set()
    for folder in args.trim_against:
        above |= names_in(folder)

    shutil.rmtree(args.site, ignore_errors=True)
    os.makedirs(args.site)
    files = []
    for root, _, names in os.walk(args.staged):
        for name in names:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, args.staged).replace(os.sep, '/')
            if name.startswith('.') or os.path.getsize(full) == 0:
                continue
            if rel.lower().endswith('.gro'):
                def drop(entry):
                    entry = entry.replace('\\', '/')
                    return entry.lower() in above and not READ_FROM_CD.match(entry)
                data, removed = stored_group(full, drop)
                if removed:
                    print(f'{rel}: without {len(removed)} files that rank lower than the same files elsewhere '
                          f'({sum(i.compress_size for i in removed) / 1048576:.1f} MB)')
            else:
                with open(full, 'rb') as f:
                    data = f.read()
            files.append((rel, data))
    files.sort()

    # (the segments of all files at once)
    jobs = [(rel, offset) for rel, data in files for offset in range(0, len(data), SEGMENT)]
    data_of = dict(files)
    with concurrent.futures.ProcessPoolExecutor() as pool:
        compressed = dict(zip(jobs, pool.map(compress, (data_of[rel][o:o + SEGMENT] for rel, o in jobs))))

    listed = []
    for rel, data in files:
        segments = [compressed[(rel, o)] for o in range(0, len(data), SEGMENT)]
        target = os.path.join(args.site, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        if sum(map(len, segments)) < len(data):
            with open(target + '.xz', 'wb') as f:
                for segment in segments:
                    f.write(segment)
            listed.append({'path': rel, 'size': len(data), 'xz': [len(s) for s in segments]})
        else:
            with open(target, 'wb') as f:
                f.write(data)
            listed.append({'path': rel, 'size': len(data)})
    with open(args.pack_list, 'w') as f:
        json.dump({'segment': SEGMENT, 'files': listed}, f)

    served = sum(sum(entry['xz']) if 'xz' in entry else entry['size'] for entry in listed)
    print(f'{args.site}: {len(listed)} files, {sum(e["size"] for e in listed) / 1048576:.1f} MB, '
          f'{served / 1048576:.1f} MB to download')


if __name__ == '__main__':
    main()
