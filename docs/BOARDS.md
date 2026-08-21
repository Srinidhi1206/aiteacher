# Indian Education Boards - Reference Data

Source of truth for the seed data in `prisma/seed.ts`. Modeled as database
rows (`State`, `Board`), not a hard-coded enum, specifically so an admin can
add/edit/rename/deactivate a board later without a code deploy - board
names do change over time, and this list is a reasonable starting point,
not guaranteed to be perfectly current for every state.

## Hierarchy

```
State/UT  ---0-or-1--->  its own state Board
                          (a state board is ALWAYS tied to exactly one state)

National Board (CBSE, CISCE, NIOS)  ---available to every State/UT regardless of stateId
```

A `Board.stateId` of `null` means "national" - available to students in any
state. A `Board.stateId` pointing at a `State` means that board only makes
sense for students in that state. `SchoolClass` (Class 1-10) is scoped to a
`Board`, not directly to a state, since the same board (e.g. CBSE) spans
every state.

## National boards

| Short name | Full name |
|---|---|
| CBSE | Central Board of Secondary Education |
| CISCE | Council for the Indian School Certificate Examinations (ICSE / ISC) |
| NIOS | National Institute of Open Schooling |

## States (28) and their state boards

| State | Code | State board |
|---|---|---|
| Andhra Pradesh | AP | BSEAP - Board of Secondary Education, Andhra Pradesh |
| Arunachal Pradesh | AR | APBSE - Arunachal Pradesh Board of Secondary Education |
| Assam | AS | SEBA - Board of Secondary Education, Assam |
| Bihar | BR | BSEB - Bihar School Examination Board |
| Chhattisgarh | CG | CGBSE - Chhattisgarh Board of Secondary Education |
| Goa | GA | GBSHSE - Goa Board of Secondary and Higher Secondary Education |
| Gujarat | GJ | GSEB - Gujarat Secondary and Higher Secondary Education Board |
| Haryana | HR | BSEH - Board of School Education Haryana |
| Himachal Pradesh | HP | HPBOSE - Himachal Pradesh Board of School Education |
| Jharkhand | JH | JAC - Jharkhand Academic Council |
| Karnataka | KA | KSEAB - Karnataka School Examination and Assessment Board |
| Kerala | KL | KBPE - Kerala Board of Public Examinations |
| Madhya Pradesh | MP | MPBSE - Madhya Pradesh Board of Secondary Education |
| Maharashtra | MH | MSBSHSE - Maharashtra State Board of Secondary and Higher Secondary Education |
| Manipur | MN | BOSEM - Board of Secondary Education Manipur |
| Meghalaya | ML | MBOSE - Meghalaya Board of School Education |
| Mizoram | MZ | MBSE - Mizoram Board of School Education |
| Nagaland | NL | NBSE - Nagaland Board of School Education |
| Odisha | OD | BSE Odisha - Board of Secondary Education, Odisha |
| Punjab | PB | PSEB - Punjab School Education Board |
| Rajasthan | RJ | RBSE - Board of Secondary Education Rajasthan |
| Sikkim | SK | SBSE - Sikkim Board of Secondary Education |
| Tamil Nadu | TN | TNBSE - Tamil Nadu State Board of School Examinations |
| Telangana | TG | BSE Telangana - Telangana State Board of Secondary Education |
| Tripura | TR | TBSE - Tripura Board of Secondary Education |
| Uttar Pradesh | UP | UPMSP - Uttar Pradesh Madhyamik Shiksha Parishad |
| Uttarakhand | UK | UBSE - Uttarakhand Board of School Education |
| West Bengal | WB | WBBSE - West Bengal Board of Secondary Education |

## Union Territories (8)

Most UTs don't run a dedicated state board and rely on CBSE (a national
board, automatically available everywhere) instead; the two exceptions with
their own board are noted below.

| UT | Code | Dedicated board |
|---|---|---|
| Delhi | DL | - (uses national boards) |
| Jammu and Kashmir | JK | JKBOSE - Jammu and Kashmir Board of School Education |
| Ladakh | LA | - (uses national boards) |
| Puducherry | PY | DSE Puducherry - Directorate of School Education, Puducherry |
| Chandigarh | CH | - (uses national boards) |
| Andaman and Nicobar Islands | AN | - (uses national boards) |
| Dadra and Nagar Haveli and Daman and Diu | DN | - (uses national boards) |
| Lakshadweep | LD | - (uses national boards) |

## What's pre-seeded vs. admin-configured

- **Pre-seeded** (`npm run db:seed`): all 28 states + 8 UTs, all boards
  listed above, Class 1-10 for the 3 national boards only, a 6-subject
  starter catalog (Mathematics, Science, English, Social Science, Hindi,
  Computer Science) linked to those national-board classes.
- **Admin-configured** (Stage C - `Admin > Board & Classes`, not built yet):
  enabling Class 1-10 for a specific *state* board, enabling/disabling
  individual boards or states, adding a board that isn't in this seed list,
  configuring which subjects are available per class.

## Editing this data later

Once Stage C's Admin UI exists, do this through the UI. Until then, editing
via `npm run db:studio` or directly in `prisma/seed.ts` (then re-running
`npm run db:seed` - it's idempotent, safe to re-run) both work.
