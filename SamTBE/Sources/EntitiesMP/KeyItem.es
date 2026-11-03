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

805
%{
#include "EntitiesMP/StdH/StdH.h"
#include "Models/Items/ItemHolder/ItemHolder.h"
%}

uses "EntitiesMP/Item";

// key type 
enum KeyItemType {
  0 KIT_BOOKOFWISDOM      "Book of wisdom",
  1 KIT_CROSSWOODEN       "Wooden cross",
  2 KIT_CROSSMETAL        "Silver cross",
  3 KIT_CROSSGOLD         "Gold cross",
  4 KIT_JAGUARGOLDDUMMY   "Gold jaguar",
  5 KIT_HAWKWINGS01DUMMY  "Hawk wings - part 1",
  6 KIT_HAWKWINGS02DUMMY  "Hawk wings - part 2",
  7 KIT_HOLYGRAIL         "Holy grail",
  8 KIT_TABLESDUMMY       "Tablet of wisdom",
  9 KIT_WINGEDLION        "Winged lion",
 10 KIT_ELEPHANTGOLD      "Gold elephant",
 11 KIT_STATUEHEAD01      "Seriously scary ceremonial mask",
 12 KIT_STATUEHEAD02      "Hilariously happy ceremonial mask",
 13 KIT_STATUEHEAD03      "Ix Chel mask",
 14 KIT_KINGSTATUE        "Statue of King Tilmun",
 15 KIT_CRYSTALSKULL      "Crystal Skull",
};

// event for sending through receive item
event EKey {
  enum KeyItemType kitType,
};

%{

// The First Encounter's keys: in its levels, the key numbers are its keys (doors and keys in a
// level use the same numbers, so they need no converting)
#define TFE_KIT_ANKHWOOD       0
#define TFE_KIT_ANKHROCK       1
#define TFE_KIT_ANKHGOLD       2
#define TFE_KIT_AMONGOLD       3
#define TFE_KIT_ANKHGOLDDUMMY  4
#define TFE_KIT_ELEMENTEARTH   5
#define TFE_KIT_ELEMENTWATER   6
#define TFE_KIT_ELEMENTAIR     7
#define TFE_KIT_ELEMENTFIRE    8
#define TFE_KIT_RAKEY          9
#define TFE_KIT_MOONKEY       10
#define TFE_KIT_EYEOFRA       12
#define TFE_KIT_SCARAB        13
#define TFE_KIT_COBRA         14
#define TFE_KIT_SCARABDUMMY   15
#define TFE_KIT_HEART         16
#define TFE_KIT_FEATHER       17
#define TFE_KIT_SPHINX1       18
#define TFE_KIT_SPHINX2       19

static const char *GetTFEKeyName(int kit)
{
  switch(kit) {
  case TFE_KIT_ANKHWOOD      :  return TRANS("Wooden ankh"); break;
  case TFE_KIT_ANKHROCK      :  return TRANS("Stone ankh"); break;
  case TFE_KIT_ANKHGOLD      :
  case TFE_KIT_ANKHGOLDDUMMY :  return TRANS("Gold ankh"); break;
  case TFE_KIT_AMONGOLD      :  return TRANS("Gold Amon statue"); break;
  case TFE_KIT_ELEMENTEARTH  :  return TRANS("Earth element"); break;
  case TFE_KIT_ELEMENTWATER  :  return TRANS("Water element"); break;
  case TFE_KIT_ELEMENTAIR    :  return TRANS("Air element"); break;
  case TFE_KIT_ELEMENTFIRE   :  return TRANS("Fire element"); break;
  case TFE_KIT_RAKEY         :  return TRANS("Ra key"); break;
  case TFE_KIT_MOONKEY       :  return TRANS("Moon key"); break;
  case TFE_KIT_EYEOFRA       :  return TRANS("Eye of Ra"); break;
  case TFE_KIT_SCARAB        :
  case TFE_KIT_SCARABDUMMY   :  return TRANS("Scarab"); break;
  case TFE_KIT_COBRA         :  return TRANS("Cobra"); break;
  case TFE_KIT_HEART         :  return TRANS("Gold Heart"); break;
  case TFE_KIT_FEATHER       :  return TRANS("Feather of Truth"); break;
  case TFE_KIT_SPHINX1       :
  case TFE_KIT_SPHINX2       :  return TRANS("Gold Sphinx"); break;
  default: return TRANS("unknown item"); break;
  };
}

// if a key isn't kept (one of a few that only open something when picked up)
BOOL IsDummyKey(int kit)
{
  if (_pNetwork->ga_World.wo_bTFE) {
    return kit==TFE_KIT_ANKHGOLDDUMMY || kit==TFE_KIT_SCARABDUMMY;
  }
  return kit==KIT_HAWKWINGS01DUMMY || kit==KIT_HAWKWINGS02DUMMY || kit==KIT_TABLESDUMMY
      || kit==KIT_JAGUARGOLDDUMMY;
}

const char *GetKeyName(int /*enum KeyItemType*/ _kit)
{
  // (in The First Encounter's levels, its keys)
  if (_pNetwork->ga_World.wo_bTFE) {
    return GetTFEKeyName(_kit);
  }
  enum KeyItemType kit = (KeyItemType) _kit;

  switch(kit) {
  case KIT_BOOKOFWISDOM     :  return TRANS("Book of wisdom"); break;
  case KIT_CROSSWOODEN      :  return TRANS("Wooden cross"); break;
  case KIT_CROSSGOLD        :  return TRANS("Gold cross"); break;
  case KIT_CROSSMETAL       :  return TRANS("Silver cross"); break;
  case KIT_JAGUARGOLDDUMMY  :  return TRANS("Gold jaguar"); break;
  case KIT_HAWKWINGS01DUMMY :  return TRANS("Hawk wings - part 1"); break;
  case KIT_HAWKWINGS02DUMMY :  return TRANS("Hawk wings - part 2"); break;
  case KIT_HOLYGRAIL        :  return TRANS("Holy grail"); break;
  case KIT_TABLESDUMMY      :  return TRANS("Tablet of wisdom"); break;
  case KIT_WINGEDLION       :  return TRANS("Winged lion"); break;
  case KIT_ELEPHANTGOLD     :  return TRANS("Gold elephant"); break;    
  case KIT_STATUEHEAD01     :  return TRANS("Seriously scary ceremonial mask"); break;
  case KIT_STATUEHEAD02     :  return TRANS("Hilariously happy ceremonial mask"); break;
  case KIT_STATUEHEAD03     :  return TRANS("Ix Chel mask"); break;   
  case KIT_KINGSTATUE       :  return TRANS("Statue of King Tilmun"); break;   
  case KIT_CRYSTALSKULL     :  return TRANS("Crystal Skull"); break;   
  default: return TRANS("unknown item"); break;
  };
}

%}

class CKeyItem : CItem {
name      "KeyItem";
thumbnail "Thumbnails\\KeyItem.tbn";
features  "IsImportant";

properties:
  1 enum KeyItemType m_kitType    "Type" 'Y' = KIT_BOOKOFWISDOM, // key type
  3 INDEX m_iSoundComponent = 0,
  5 FLOAT m_fSize "Size" = 1.0f,

components:
  0 class   CLASS_BASE        "Classes\\Item.ecl",

// ********* ANKH KEY *********
  1 model   MODEL_BOOKOFWISDOM      "ModelsMP\\Items\\Keys\\BookOfWisdom\\Book.mdl",
  2 texture TEXTURE_BOOKOFWISDOM    "ModelsMP\\Items\\Keys\\BookOfWisdom\\Book.tex",

  5 model   MODEL_CROSSWOODEN       "ModelsMP\\Items\\Keys\\Cross\\Cross.mdl",
  6 texture TEXTURE_CROSSWOODEN     "ModelsMP\\Items\\Keys\\Cross\\CrossWooden.tex",
  
  7 model   MODEL_CROSSMETAL        "ModelsMP\\Items\\Keys\\Cross\\Cross.mdl",
  8 texture TEXTURE_CROSSMETAL      "ModelsMP\\Items\\Keys\\Cross\\CrossMetal.tex",

 10 model   MODEL_CROSSGOLD         "ModelsMP\\Items\\Keys\\GoldCross\\Cross.mdl",
 11 texture TEXTURE_CROSSGOLD       "ModelsMP\\Items\\Keys\\GoldCross\\Cross.tex",

 15 model   MODEL_JAGUARGOLD        "ModelsMP\\Items\\Keys\\GoldJaguar\\Jaguar.mdl",

 20 model   MODEL_HAWKWINGS01       "ModelsMP\\Items\\Keys\\HawkWings\\WingRight.mdl",
 21 model   MODEL_HAWKWINGS02       "ModelsMP\\Items\\Keys\\HawkWings\\WingLeft.mdl",
 22 texture TEXTURE_HAWKWINGS       "ModelsMP\\Items\\Keys\\HawkWings\\Wings.tex",

 30 model   MODEL_HOLYGRAIL         "ModelsMP\\Items\\Keys\\HolyGrail\\Grail.mdl",
 31 texture TEXTURE_HOLYGRAIL       "ModelsMP\\Items\\Keys\\HolyGrail\\Grail.tex",

 35 model   MODEL_TABLESOFWISDOM    "ModelsMP\\Items\\Keys\\TablesOfWisdom\\Tables.mdl",
 36 texture TEXTURE_TABLESOFWISDOM  "ModelsMP\\Items\\Keys\\TablesOfWisdom\\Tables.tex",

 40 model   MODEL_WINGEDLION        "ModelsMP\\Items\\Keys\\WingLion\\WingLion.mdl",
 
 45 model   MODEL_ELEPHANTGOLD      "ModelsMP\\Items\\Keys\\GoldElephant\\Elephant.mdl",

 50 model   MODEL_STATUEHEAD01      "ModelsMP\\Items\\Keys\\Statue01\\Statue.mdl",
 51 texture TEXTURE_STATUEHEAD01    "ModelsMP\\Items\\Keys\\Statue01\\Statue.tex",
 52 model   MODEL_STATUEHEAD02      "ModelsMP\\Items\\Keys\\Statue02\\Statue.mdl",
 53 texture TEXTURE_STATUEHEAD02    "ModelsMP\\Items\\Keys\\Statue02\\Statue.tex",
 54 model   MODEL_STATUEHEAD03      "ModelsMP\\Items\\Keys\\Statue03\\Statue.mdl",
 55 texture TEXTURE_STATUEHEAD03    "ModelsMP\\Items\\Keys\\Statue03\\Statue.tex",

 58 model   MODEL_KINGSTATUE        "ModelsMP\\Items\\Keys\\ManStatue\\Statue.mdl",
 
 60 model   MODEL_CRYSTALSKULL      "ModelsMP\\Items\\Keys\\CrystalSkull\\Skull.mdl",
 61 texture TEXTURE_CRYSTALSKULL    "ModelsMP\\Items\\Keys\\CrystalSkull\\Skull.tex",

 // ********* MISC *********
250 texture TEXTURE_FLARE       "ModelsMP\\Items\\Flares\\Flare.tex",
251 model   MODEL_FLARE         "ModelsMP\\Items\\Flares\\Flare.mdl",
252 texture TEX_REFL_GOLD01     "ModelsMP\\ReflectionTextures\\Gold01.tex",
253 texture TEX_REFL_METAL01    "ModelsMP\\ReflectionTextures\\LightMetal01.tex",
254 texture TEX_SPEC_MEDIUM     "ModelsMP\\SpecularTextures\\Medium.tex",
255 texture TEX_SPEC_STRONG     "ModelsMP\\SpecularTextures\\Strong.tex",

// ********* THE FIRST ENCOUNTER'S KEYS (from its folder) *********
100 model   MODEL_TFE_ANKHWOOD      "Models\\Items\\Keys\\AnkhWood\\Ankh.mdl",
101 texture TEXTURE_TFE_ANKHWOOD    "Models\\Ages\\Egypt\\Vehicles\\BigBoat\\OldWood.tex",
102 model   MODEL_TFE_ANKHROCK      "Models\\Items\\Keys\\AnkhStone\\Ankh.mdl",
103 texture TEXTURE_TFE_ANKHROCK    "Models\\Items\\Keys\\AnkhStone\\Stone.tex",
104 model   MODEL_TFE_ANKHGOLD      "Models\\Items\\Keys\\AnkhGold\\Ankh.mdl",
105 texture TEXTURE_TFE_ANKHGOLD    "Models\\Items\\Keys\\AnkhGold\\Ankh.tex",
106 model   MODEL_TFE_AMONGOLD      "Models\\Ages\\Egypt\\Gods\\Amon\\AmonGold.mdl",
107 texture TEXTURE_TFE_AMONGOLD    "Models\\Ages\\Egypt\\Gods\\Amon\\AmonGold.tex",
110 model   MODEL_TFE_ELEMENTAIR    "Models\\Items\\Keys\\Elements\\Air.mdl",
111 texture TEXTURE_TFE_ELEMENTAIR  "Models\\Items\\Keys\\Elements\\Air.tex",
112 model   MODEL_TFE_ELEMENTWATER  "Models\\Items\\Keys\\Elements\\Water.mdl",
113 texture TEXTURE_TFE_ELEMENTWATER "Models\\Items\\Keys\\Elements\\Water.tex",
114 model   MODEL_TFE_ELEMENTFIRE   "Models\\Items\\Keys\\Elements\\Fire.mdl",
115 texture TEXTURE_TFE_ELEMENTFIRE "Models\\Items\\Keys\\Elements\\Fire.tex",
116 model   MODEL_TFE_ELEMENTEARTH  "Models\\Items\\Keys\\Elements\\Earth.mdl",
117 texture TEXTURE_TFE_ELEMENTEARTH "Models\\Items\\Keys\\Elements\\Texture.tex",
120 model   MODEL_TFE_RAKEY         "Models\\Items\\Keys\\RaKey\\Key.mdl",
121 texture TEXTURE_TFE_RAKEY       "Models\\Items\\Keys\\RaKey\\Key.tex",
122 model   MODEL_TFE_MOONKEY       "Models\\Items\\Keys\\RaSign\\Sign.mdl",
123 texture TEXTURE_TFE_MOONKEY     "Models\\Items\\Keys\\RaSign\\Sign.tex",
124 model   MODEL_TFE_EYEOFRA       "Models\\Items\\Keys\\EyeOfRa\\EyeOfRa.mdl",
125 texture TEXTURE_TFE_EYEOFRA     "Models\\Items\\Keys\\EyeOfRa\\EyeOfRa.tex",
126 model   MODEL_TFE_SCARAB        "Models\\Items\\Keys\\Scarab\\Scarab.mdl",
127 texture TEXTURE_TFE_SCARAB      "Models\\Items\\Keys\\Scarab\\Scarab.tex",
128 model   MODEL_TFE_COBRA         "Models\\Items\\Keys\\Uaset\\Uaset.mdl",
129 texture TEXTURE_TFE_COBRA       "Models\\Items\\Keys\\Uaset\\Uaset.tex",
130 model   MODEL_TFE_FEATHER       "Models\\Items\\Keys\\Luxor\\FeatherOfTruth.mdl",
131 texture TEXTURE_TFE_FEATHER     "Models\\Items\\Keys\\Luxor\\FeatherOfTruth.tex",
132 model   MODEL_TFE_HEART         "Models\\Items\\Keys\\Luxor\\GoldHeart.mdl",
133 texture TEXTURE_TFE_HEART       "Models\\Items\\Keys\\Luxor\\GoldHeart.tex",
134 model   MODEL_TFE_SPHINXGOLD    "Models\\Items\\Keys\\GoldSphinx\\GoldSphinx.mdl",
135 texture TEXTURE_TFE_SPHINXGOLD  "Models\\Items\\Keys\\GoldSphinx\\Sphinx.tex",

// ************** SOUNDS **************
300 sound   SOUND_KEY         "Sounds\\Items\\Key.wav",

functions:
  void Precache(void) {
    PrecacheSound(SOUND_KEY);
  }
  /* Fill in entity statistics - for AI purposes only */
  BOOL FillEntityStatistics(EntityStats *pes)
  {
    pes->es_strName = GetKeyName(m_kitType);
    pes->es_ctCount = 1;
    pes->es_ctAmmount = 1;
    pes->es_fValue = 1;
    pes->es_iScore = 0;//m_iScore;
    return TRUE;
  }
  
  // render particles
  void RenderParticles(void) {
    // no particles when not existing
    if (GetRenderType()!=CEntity::RT_MODEL || !ShowItemParticles()) {
      return;
    }
    // (as in The First Encounter, in its levels)
    if (GetWorld()->wo_bTFE) {
      if (m_kitType==TFE_KIT_AMONGOLD) {
        Particles_Stardust(this, 1.6f, 1.00f, PT_STAR08, 32);
      } else {
        Particles_Stardust(this, 0.9f, 0.70f, PT_STAR08, 32);
      }
      return;
    }
    switch (m_kitType) {
    case KIT_BOOKOFWISDOM    :
    case KIT_CRYSTALSKULL    :   
    case KIT_HOLYGRAIL       :
      Particles_Stardust(this, 1.0f, 0.5f, PT_STAR08, 64);
      break;
    case KIT_JAGUARGOLDDUMMY :
      Particles_Stardust(this, 2.0f, 2.0f, PT_STAR08, 64);
      break;
    case KIT_CROSSWOODEN     :
    case KIT_CROSSMETAL      :   
    case KIT_CROSSGOLD       :      
    case KIT_HAWKWINGS01DUMMY:
    case KIT_HAWKWINGS02DUMMY:
    case KIT_TABLESDUMMY     :
    case KIT_WINGEDLION      :
    case KIT_ELEPHANTGOLD    :
    case KIT_STATUEHEAD01    :
    case KIT_STATUEHEAD02    :
    case KIT_STATUEHEAD03    :
    case KIT_KINGSTATUE      :
    default:
      Particles_Stardust(this, 1.5f, 1.1f, PT_STAR08, 64);
      break;    
    }
  }
  


  // look like one of The First Encounter's keys (in its levels)
  void SetTFEProperties(void)
  {
    INDEX iModel = -1, iTexture = -1, iReflection = 0, iSpecular = 0;
    FLOAT fStretch = 1.0f;
    switch ((INDEX)m_kitType) {
      case TFE_KIT_ANKHWOOD:      iModel = MODEL_TFE_ANKHWOOD;     iTexture = TEXTURE_TFE_ANKHWOOD; break;
      case TFE_KIT_ANKHROCK:      iModel = MODEL_TFE_ANKHROCK;     iTexture = TEXTURE_TFE_ANKHROCK; break;
      case TFE_KIT_ANKHGOLD:
      case TFE_KIT_ANKHGOLDDUMMY: iModel = MODEL_TFE_ANKHGOLD;     iTexture = TEXTURE_TFE_ANKHGOLD;
                                  iReflection = TEX_REFL_GOLD01;   iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_SPHINX1:
      case TFE_KIT_SPHINX2:       iModel = MODEL_TFE_SPHINXGOLD;   iTexture = TEXTURE_TFE_SPHINXGOLD;
                                  iReflection = TEX_REFL_GOLD01;   iSpecular = TEX_SPEC_MEDIUM;
                                  fStretch = 2.0f; break;
      case TFE_KIT_AMONGOLD:      iModel = MODEL_TFE_AMONGOLD;     iTexture = TEXTURE_TFE_AMONGOLD;
                                  iReflection = TEX_REFL_GOLD01;   iSpecular = TEX_SPEC_MEDIUM;
                                  fStretch = 2.0f; break;
      case TFE_KIT_ELEMENTEARTH:  iModel = MODEL_TFE_ELEMENTEARTH; iTexture = TEXTURE_TFE_ELEMENTEARTH;
                                  iReflection = TEX_REFL_METAL01;  iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_ELEMENTAIR:    iModel = MODEL_TFE_ELEMENTAIR;   iTexture = TEXTURE_TFE_ELEMENTAIR;
                                  iReflection = TEX_REFL_METAL01;  iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_ELEMENTWATER:  iModel = MODEL_TFE_ELEMENTWATER; iTexture = TEXTURE_TFE_ELEMENTWATER;
                                  iReflection = TEX_REFL_METAL01;  iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_ELEMENTFIRE:   iModel = MODEL_TFE_ELEMENTFIRE;  iTexture = TEXTURE_TFE_ELEMENTFIRE;
                                  iReflection = TEX_REFL_METAL01;  iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_RAKEY:         iModel = MODEL_TFE_RAKEY;        iTexture = TEXTURE_TFE_RAKEY;
                                  iReflection = TEX_REFL_GOLD01;   iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_MOONKEY:       iModel = MODEL_TFE_MOONKEY;      iTexture = TEXTURE_TFE_MOONKEY;
                                  iReflection = TEX_REFL_GOLD01;   iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_EYEOFRA:       iModel = MODEL_TFE_EYEOFRA;      iTexture = TEXTURE_TFE_EYEOFRA;
                                  iReflection = TEX_REFL_GOLD01;   iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_SCARAB:
      case TFE_KIT_SCARABDUMMY:   iModel = MODEL_TFE_SCARAB;       iTexture = TEXTURE_TFE_SCARAB;
                                  iReflection = TEX_REFL_METAL01;  iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_COBRA:         iModel = MODEL_TFE_COBRA;        iTexture = TEXTURE_TFE_COBRA;
                                  iReflection = TEX_REFL_GOLD01;   iSpecular = TEX_SPEC_MEDIUM; break;
      case TFE_KIT_FEATHER:       iModel = MODEL_TFE_FEATHER;      iTexture = TEXTURE_TFE_FEATHER; break;
      case TFE_KIT_HEART:         iModel = MODEL_TFE_HEART;        iTexture = TEXTURE_TFE_HEART;
                                  iReflection = TEX_REFL_GOLD01;   iSpecular = TEX_SPEC_MEDIUM; break;
      default: break;
    }
    // (not one of its keys)
    if (iModel<0) {
      return;
    }
    // set appearance
    AddItem(iModel, iTexture, iReflection, iSpecular, 0);
    // add flare
    if (m_kitType==TFE_KIT_AMONGOLD) {
      AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.5f,0), FLOAT3D(2,2,0.3f) );
    } else {
      AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
    }
    StretchItem(FLOAT3D(fStretch, fStretch, fStretch));
  }

  // set health properties depending on type
  void SetProperties(void)
  {
    m_fRespawnTime = (m_fCustomRespawnTime>0) ? m_fCustomRespawnTime : 10.0f; 
    m_strDescription = GetKeyName(m_kitType);
    // (The First Encounter's levels saved its key sound's number)
    m_iSoundComponent = SOUND_KEY;

    if (GetWorld()->wo_bTFE) {
      SetTFEProperties();
      GetModelObject()->StretchModel(FLOAT3D(m_fSize, m_fSize, m_fSize));
      return;
    }

    switch (m_kitType) {
      case KIT_BOOKOFWISDOM :
        // set appearance
        AddItem(MODEL_BOOKOFWISDOM, TEXTURE_BOOKOFWISDOM , 0, 0, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_CROSSWOODEN:
        // set appearance
        AddItem(MODEL_CROSSWOODEN, TEXTURE_CROSSWOODEN, 0, 0, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_CROSSMETAL:
        // set appearance
        AddItem(MODEL_CROSSMETAL, TEXTURE_CROSSMETAL, TEX_REFL_METAL01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_CROSSGOLD:
        // set appearance
        AddItem(MODEL_CROSSGOLD, TEXTURE_CROSSGOLD, TEX_REFL_GOLD01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_JAGUARGOLDDUMMY:
        // set appearance
        AddItem(MODEL_JAGUARGOLD, TEX_REFL_GOLD01, TEX_REFL_GOLD01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.5f,0), FLOAT3D(2,2,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_HAWKWINGS01DUMMY:
        // set appearance
        AddItem(MODEL_HAWKWINGS01, TEXTURE_HAWKWINGS, 0, 0, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_HAWKWINGS02DUMMY:
        // set appearance
        AddItem(MODEL_HAWKWINGS02, TEXTURE_HAWKWINGS, 0, 0, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_HOLYGRAIL:
        // set appearance
        AddItem(MODEL_HOLYGRAIL, TEXTURE_HOLYGRAIL, TEX_REFL_METAL01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_TABLESDUMMY:
        // set appearance
        AddItem(MODEL_TABLESOFWISDOM, TEXTURE_TABLESOFWISDOM, TEX_REFL_METAL01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_WINGEDLION:
        // set appearance
        AddItem(MODEL_WINGEDLION, TEX_REFL_GOLD01, TEX_REFL_GOLD01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_ELEPHANTGOLD:
        // set appearance
        AddItem(MODEL_ELEPHANTGOLD, TEX_REFL_GOLD01, TEX_REFL_GOLD01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.5f,0), FLOAT3D(2,2,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;      
      case KIT_STATUEHEAD01:
        // set appearance
        AddItem(MODEL_STATUEHEAD01, TEXTURE_STATUEHEAD01, 0, 0, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_STATUEHEAD02:
        // set appearance
        AddItem(MODEL_STATUEHEAD02, TEXTURE_STATUEHEAD02, 0, 0, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;      
      case KIT_STATUEHEAD03:
        // set appearance
        AddItem(MODEL_STATUEHEAD03, TEXTURE_STATUEHEAD03, 0, 0, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_KINGSTATUE:
        // set appearance
        AddItem(MODEL_KINGSTATUE, TEX_REFL_GOLD01, TEX_REFL_GOLD01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
      case KIT_CRYSTALSKULL:
        // set appearance
        AddItem(MODEL_CRYSTALSKULL, TEXTURE_CRYSTALSKULL, TEX_REFL_METAL01, TEX_SPEC_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f, 1.0f, 1.0f));
        m_iSoundComponent = SOUND_KEY;
        break;
    }
    GetModelObject()->StretchModel(FLOAT3D(m_fSize, m_fSize, m_fSize));
  };

procedures:
  ItemCollected(EPass epass) : CItem::ItemCollected {
    ASSERT(epass.penOther!=NULL);

    // send key to entity
    EKey eKey;
    eKey.kitType = m_kitType;
    // if health is received
    if (epass.penOther->ReceiveItem(eKey)) {
      if(_pNetwork->IsPlayerLocal(epass.penOther)) {IFeel_PlayEffect("PU_Key");}
      // play the pickup sound
      m_soPick.Set3DParameters(50.0f, 1.0f, 1.0f, 1.0f);
      PlaySound(m_soPick, m_iSoundComponent, SOF_3D);
      m_fPickSoundLen = GetSoundLength(m_iSoundComponent);
      jump CItem::ItemReceived();
    }
    return;
  };

  Main() {
    Initialize();     // initialize base class
    StartModelAnim(ITEMHOLDER_ANIM_SMALLOSCILATION, AOF_LOOPING|AOF_NORESTART);
    // (The First Encounter's keys are smaller)
    ForceCollisionBoxIndexChange(GetWorld()->wo_bTFE ? ITEMHOLDER_COLLISION_BOX_SMALL : ITEMHOLDER_COLLISION_BOX_BIG);
    SetProperties();  // set properties

    jump CItem::ItemLoop();
  };
};
