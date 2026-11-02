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

#include "Engine/StdH.h"

#include <emscripten.h>
#include <Engine/Base/ArchiveReader.h>
#include <Engine/Base/FileName.h>
#include <Engine/Math/Functions.h>

// Group files (.gro) that the page keeps in the browser's storage, read from there as they
// are needed (see web/shell/archives.js, Module.webArchives): what is in memory is copied at
// once, the rest is waited for (the engine yields to the browser, as it does every frame).

EM_JS(int, web_archive_open, (const char *strPath), {
  const archives = Module['webArchives'];
  return archives ? archives.open(UTF8ToString(strPath)) : -1;
});

EM_JS(double, web_archive_size, (int iArchive), {
  return Module['webArchives'].size(iArchive);
});

// bytes copied, or -1 if some of them aren't in memory
EM_JS(int, web_archive_read, (int iArchive, double dOffset, void *pvBuffer, int iLength), {
  return Module['webArchives'].readSync(iArchive, dOffset, iLength, HEAPU8, pvBuffer);
});

// get them into memory: 0, or -1 if they can't be read
EM_ASYNC_JS(int, web_archive_fetch, (int iArchive, double dOffset, int iLength), {
  return await Module['webArchives'].fetch(iArchive, dOffset, iLength);
});

// (at most this much is asked for at once, so it fits in the page's memory for them)
#define WEB_ARCHIVE_PORTION (8*1024*1024)

class CWebArchiveReader : public CArchiveReader {
public:
  INDEX war_iArchive;
  SLONG war_slSize;

  CWebArchiveReader(INDEX iArchive) : war_iArchive(iArchive)
  {
    war_slSize = (SLONG)web_archive_size(iArchive);
  }
  SLONG GetSize(void)
  {
    return war_slSize;
  }
  SLONG ReadAt(SLONG slOffset, void *pvBuffer, SLONG slLen)
  {
    if (slOffset<0) {
      return -1;
    }
    slLen = Min(slLen, war_slSize-slOffset);
    SLONG slDone = 0;
    while (slDone<slLen) {
      const SLONG slPortion = Min(slLen-slDone, SLONG(WEB_ARCHIVE_PORTION));
      UBYTE *pub = (UBYTE *)pvBuffer+slDone;
      INDEX ctRead = web_archive_read(war_iArchive, slOffset+slDone, pub, slPortion);
      // not in memory yet: from the browser's storage
      if (ctRead<0) {
        if (web_archive_fetch(war_iArchive, slOffset+slDone, slPortion)!=0) {
          return slDone>0 ? slDone : -1;
        }
        ctRead = web_archive_read(war_iArchive, slOffset+slDone, pub, slPortion);
        if (ctRead<0) {
          return slDone>0 ? slDone : -1;
        }
      }
      if (ctRead==0) {
        break;
      }
      slDone += ctRead;
    }
    return slDone;
  }
};

// a reader for the archive at that path if the page keeps it in the browser's storage, else NULL
CArchiveReader *Web_OpenArchiveReader(const CTFileName &fnm)
{
  const INDEX iArchive = web_archive_open((const char *)(const CTString &)fnm);
  if (iArchive<0) {
    return NULL;
  }
  return new CWebArchiveReader(iArchive);
}
