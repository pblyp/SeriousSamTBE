/* Copyright (c) 2002-2012 Croteam Ltd. 
This program is free software; you can redistribute it and/or modify
it under the terms of version 2 of the GNU General Public License as published by
the Free Software Foundation


This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along
with this program; if not, write to the Free Software Foundation, Inc.,
51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA. */

// Reads every file of the given group files (.gro) through the engine's archive reader, in
// several ways (at once, in odd pieces, the second half before the first), and checks each
// against the CRC kept in the archive. In the web version (web/test/archive-reader.mjs), the
// archives are read from the browser's storage as they are needed (see WebArchive.cpp).
//
//   ArchiveReaderTest [--cd <CD path>] <archives...>

#include "Engine/StdH.h"
#include <Engine/Engine.h>
#include <Engine/Base/Unzip.h>
#include <set>
#include <string>

// (the game defines them)
HWND _hwndMain = NULL;
class CGame *_pGame = NULL;

// the CRC-32 that zip archives keep
static ULONG CrcOf(const UBYTE *pub, SLONG sl)
{
  static ULONG aulTable[256];
  static BOOL bTable = FALSE;
  if (!bTable) {
    for (ULONG i=0; i<256; i++) {
      ULONG ul = i;
      for (INDEX iBit=0; iBit<8; iBit++) {
        ul = (ul&1) ? (0xEDB88320UL^(ul>>1)) : (ul>>1);
      }
      aulTable[i] = ul;
    }
    bTable = TRUE;
  }
  ULONG ulCRC = 0xFFFFFFFFUL;
  for (SLONG i=0; i<sl; i++) {
    ulCRC = aulTable[(ulCRC^pub[i])&0xFF]^(ulCRC>>8);
  }
  return ulCRC^0xFFFFFFFFUL;
}

int main(int argc, char **argv)
{
  int iArg = 1;
  if (argc>2 && strcmp(argv[1], "--cd")==0) {
    _fnmCDPath = CTString(argv[2]);
    iArg = 3;
  }
  for (; iArg<argc; iArg++) {
    UNZIPAddArchive(CTString(argv[iArg]));
  }
  try {
    UNZIPReadDirectoriesReverse_t();
  } catch (const char *strError) {
    printf("ERROR %s\n", strError);
    return 1;
  }
  std::set<std::string> setSeen;
  INDEX ctOK = 0, ctBad = 0, ctCD = 0;
  for (INDEX iFile=0; iFile<UNZIPGetFileCount(); iFile++) {
    const CTFileName &fnm = UNZIPGetFileAtIndex(iFile);
    if (!setSeen.insert((const char *)fnm).second) {
      continue;
    }
    ctCD += UNZIPIsFileAtIndexCD(iFile) ? 1 : 0;
    try {
      const INDEX iHandle = UNZIPOpen_t(fnm);
      const SLONG slSize = UNZIPGetSize(iHandle);
      const ULONG ulCRC = UNZIPGetCRC(iHandle);
      UBYTE *pub = (UBYTE *)malloc(slSize+1);
      // at once
      memset(pub, 0xAA, slSize);
      UNZIPReadBlock_t(iHandle, pub, 0, slSize);
      BOOL bOK = CrcOf(pub, slSize)==ulCRC;
      // in odd pieces
      static const SLONG aslPieces[] = { 7, 4093, 65536+13 };
      for (INDEX iPieces=0; iPieces<3 && bOK; iPieces++) {
        const SLONG slPiece = aslPieces[iPieces];
        if (slPiece<100 && slSize>20000) {
          continue;
        }
        memset(pub, 0xAA, slSize);
        for (SLONG slOffset=0; slOffset<slSize; slOffset+=slPiece) {
          UNZIPReadBlock_t(iHandle, pub+slOffset, slOffset, Min(slPiece, slSize-slOffset));
        }
        bOK = CrcOf(pub, slSize)==ulCRC;
      }
      // the second half, then the first (going back restarts inflating)
      if (bOK && slSize>2) {
        memset(pub, 0xAA, slSize);
        UNZIPReadBlock_t(iHandle, pub+slSize/2, slSize/2, slSize-slSize/2);
        UNZIPReadBlock_t(iHandle, pub, 0, slSize/2);
        bOK = CrcOf(pub, slSize)==ulCRC;
      }
      free(pub);
      UNZIPClose(iHandle);
      if (bOK) {
        ctOK++;
      } else {
        ctBad++;
        printf("BAD %s\n", (const char *)fnm);
      }
    } catch (const char *strError) {
      ctBad++;
      printf("ERROR %s: %s\n", (const char *)fnm, strError);
    }
  }
  printf("checked %d files: %d ok, %d bad, %d from the CD path\n", (int)(ctOK+ctBad), (int)ctOK, (int)ctBad, (int)ctCD);
  return ctBad==0 ? 0 : 1;
}
