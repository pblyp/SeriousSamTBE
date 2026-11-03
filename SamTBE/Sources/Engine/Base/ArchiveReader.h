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

#ifndef SE_INCL_ARCHIVEREADER_H
#define SE_INCL_ARCHIVEREADER_H
#ifdef PRAGMA_ONCE
  #pragma once
#endif

// Reads a group file (.gro archive), or any other file, at given positions. Whoever reads
// has its own (the sound mixer may read music while the game loads). In the web version,
// the archives that the page keeps in the browser's storage are read from there on demand
// (see WebArchive.cpp); everything else is read with stdio.
class CArchiveReader {
public:
  virtual ~CArchiveReader(void) {}
  // size of the file
  virtual SLONG GetSize(void) = 0;
  // read up to slLen bytes at slOffset: how many were read (fewer at the end), -1 on error
  virtual SLONG ReadAt(SLONG slOffset, void *pvBuffer, SLONG slLen) = 0;
};

// open a file for reading at positions (NULL if it can't be opened, with errno set)
CArchiveReader *OpenArchiveReader(const CTFileName &fnm);

#endif  /* include-once check. */
