# Field Visits — scope proposal (for approval)

*Status: draft for approval — nothing is built until you approve. Date: 23 Oct 2026.*

## 1. What I understood

Your field employees are **not salespeople**. They go out to **sites** — client offices, project sites, branches, government offices — for meetings, inspections, audits and other work. For every site they visit you want:

- **Check-in on arrival and check-out on leaving**, with GPS proof that they were really there.
- **The site pinned on the map**, so the next visit is checked against that pin.
- **A record of the work done** there: notes, photos, who they met, and what happens next.
- **The manager can see all of it**: who went where, when, for how long, and what was done. This should work on the **website and in the mobile app**.

There are **no orders, products, payments or sales targets** in this work.

*My guesses, please correct:* employees plan some visits themselves and managers assign others. Some visits are recurring, for example a weekly site inspection. Travel to sites is claimed as an expense.

## 2. What we already have and keep (about 60% of the work)

| Already built | How it is used in Field Visits |
|---|---|
| Visit check-in / check-out with GPS, accuracy and duration | Same flow, renamed and simplified |
| Distance from the place's pin, flagged "away from site" or "no GPS" | Kept as is; this is the proof of presence |
| Selfie/photo at check-in, notes at check-out | Becomes the work report (expanded) |
| Places with a map pin, assigned to employees ("clients") | Renamed **Sites** (same data, no migration risk) |
| Planned/scheduled visits | Becomes the **day plan** |
| Field tasks (assign → accept → complete) | Kept, as **tasks at a site** |
| Live map, daily route (trail) with visit stops, map of places | Kept |
| "Clients near me" on mobile | Becomes **"Sites near me"** |
| Manager sees direct reports only, HR/admin sees all | Kept |

## 3. What we remove from the screens

Orders, product catalogue, payments/collections and receipts, sales targets, leaderboard, and the sales wording ("Field Sales", "Clients", "Take order", "Collect").

**Recommendation:** switch these off with **one company setting** rather than deleting the code. Your data stays, and if a sales team ever needs them they come back in one click. Deleting them is also possible.

## 4. Full scope

Priority: **Must** = needed for a usable first release · **Should** = soon after · **Could** = later / optional.
Platform: **W** = website · **M** = mobile app.

### A. Sites (the places employees visit)
| # | Feature | Where | Priority |
|---|---|---|---|
| A1 | Site record: name, type, address, contact person + phone, notes, **pinned location** with an allowed radius (default 200 m) | W M | Must |
| A2 | **"Pin this place"** on mobile: create a new site at your current GPS position, with a photo | M | Must |
| A3 | Site list and site map with search and filters (type, area, assigned employee) | W M | Must |
| A4 | Assign sites to employees or teams | W | Must |
| A5 | Site history: every visit, report, photo and document at that site | W M | Should |
| A6 | Manager approval for sites pinned by employees (setting) | W | Should |
| A7 | Bulk import sites from Excel | W | Could |
| A8 | Site types configurable by admin (Client office, Project site, Branch, Vendor, Govt office, Other) | W | Must |

### B. Check-in / check-out at a site
| # | Feature | Where | Priority |
|---|---|---|---|
| B1 | Check in: GPS + accuracy, distance from pin, flag **away from site** / **no GPS**; selfie required / optional / off (setting) | M | Must |
| B2 | Check out: GPS at check-out, duration calculated automatically | M | Must |
| B3 | Visit purpose list configurable (Meeting, Inspection, Audit, Survey, Installation, Maintenance, Training, Other) | W M | Must |
| B4 | One open visit at a time; forgotten visits auto-closed at day end and flagged | W M | Must |
| B5 | Unplanned visit to a new place: **pin + check in in one step** | M | Must |
| B6 | Reminder "You are at *site X*, check in?" when entering a site's radius | M | Could (needs native work, see F4) |

### C. Work report (what was done at the site)
| # | Feature | Where | Priority |
|---|---|---|---|
| C1 | Notes / minutes of meeting | M W | Must |
| C2 | Multiple photos (before/after) and document uploads | M W | Must |
| C3 | People met: name, designation, phone | M W | Should |
| C4 | Outcome + next action + follow-up date; the follow-up creates a planned visit or task automatically | M W | Should |
| C5 | **Checklists / forms per visit type**, e.g. an inspection checklist, designed by admin | W M | Should |
| C6 | Manager review of reports: approve or send back with a comment (setting) | W M | Should |
| C7 | Signature of the person met, on screen | M | Could |

### D. Planning
| # | Feature | Where | Priority |
|---|---|---|---|
| D1 | Manager assigns planned visits (date, site, purpose) to employees | W | Must |
| D2 | **"My day"** on mobile: today's planned visits in order (done / pending); employees can add their own | M | Must |
| D3 | Recurring visits (e.g. every Monday at site X) | W | Should |
| D4 | Missed planned visits highlighted and reported | W | Should |

### E. Tasks at a site
| # | Feature | Where | Priority |
|---|---|---|---|
| E1 | Assign a task linked to a site with a due date; employee completes it with a photo as proof | W M | Should |
| E2 | Notifications for new, overdue and completed tasks | W M | Should |

### F. Tracking and maps
| # | Feature | Where | Priority |
|---|---|---|---|
| F1 | Live map of field staff with current status (at site X / travelling / off duty) | W | Must (exists, small changes) |
| F2 | Daily route with visit stops for any employee/date | W | Must (exists) |
| F3 | **Kilometres travelled per day** from the GPS route | W M | Should |
| F4 | Tracking in the background while on duty (today the app tracks only while open) | M | Should (native work on the machine with the Android/iOS projects) |
| F5 | Map with site pins inside the mobile app (today: list + "open in Google Maps") | M | Could (needs a Google Maps API key with billing, plus native setup) |

### G. Attendance link
| # | Feature | Where | Priority |
|---|---|---|---|
| G1 | Field employees mark day attendance from anywhere; the first site check-in can count as day check-in (setting) | M | Must |
| G2 | Attendance shows "On field duty" with the first and last site visit of the day | W M | Should |

### H. Travel allowance (uses the existing Expenses module)
| # | Feature | Where | Priority |
|---|---|---|---|
| H1 | Travel claim calculated from km travelled × rate per vehicle type (rates in settings), submitted in one tap into normal expense approval | M W | Should |
| H2 | Link an expense (food, parking, tickets) to the visit it belongs to | M W | Could |

### I. Reports (website, export to Excel and PDF)
| # | Feature | Where | Priority |
|---|---|---|---|
| I1 | Daily visit report per employee: timeline + map + work done | W | Must |
| I2 | Monthly summary: visits per employee / site / type, hours on site, km | W | Should |
| I3 | Exceptions: away-from-site check-ins, no GPS, very short visits, auto-closed visits, missed plans | W | Should |
| I4 | Site-wise report: who visited, how often, last visit | W | Should |
| I5 | Dashboard cards: today's visits, team on field, pending reports | W M | Should |

### J. Notifications
| # | Feature | Where | Priority |
|---|---|---|---|
| J1 | Manager: report submitted, exception flagged; optionally visit started/finished | W M | Should |
| J2 | Employee: new planned visit or task, report sent back | M | Should |

### K. Offline use (mobile)
| # | Feature | Where | Priority |
|---|---|---|---|
| K1 | Check-in, check-out and reports work with **no network** and sync later, keeping the original time and GPS | M | Should |

### L. Roles and settings
| # | Feature | Where | Priority |
|---|---|---|---|
| L1 | Roles: **Field Employee** (own visits), **Field Manager** (team), HR/Admin (all) | W | Must |
| L2 | Settings: selfie rule, site radius, report approval, visit purposes, site types, checklists, km rates, tracking interval, auto-close time, sales features on/off | W | Must |

## 5. Suggested delivery in stages

| Stage | Contents | Size |
|---|---|---|
| **1 — Usable field visits** | Hide sales features; rename to Field Visits / Sites; A1–A4, A8; B1–B5; C1–C2; D1–D2; F1–F2; G1; I1; L1–L2; mobile screens for all of it | Large |
| **2 — Management** | A5–A6; C3–C4, C6; D3–D4; E1–E2; G2; I2–I5; J1–J2 | Medium |
| **3 — Extras** | C5 checklists; F3 + H1 km & travel claims; K1 offline; A7 import; C7 signature; H2 | Medium |
| **4 — Native mobile** (needs the machine with the Android/iOS projects and keys) | F4 background tracking; F5 in-app map; B6 site reminders | Medium |

Each stage ends with a test build of the app and a deploy to the live server, the same way as before.

## 6. Decisions I need from you

1. **Sales features:** switch off with a setting *(recommended)*, or delete completely?
2. **Who can create sites?** Anyone in the field by pinning, with manager approval *(recommended)* · anyone, no approval · only managers/HR.
3. **Selfie at check-in:** required · optional *(recommended)* · off.
4. **Do visit reports need manager approval?** Yes · No *(recommended to start; can be switched on later)*.
5. **Travel allowance by km:** needed? If yes, the rates per vehicle (e.g. ₹/km for bike and car).
6. **Map inside the mobile app:** Google Maps (best maps; needs a Google Cloud account with billing for an API key) · keep the list + "open in Google Maps" *(free, recommended for now)*.
7. **Tracking:** all day in the background while on duty (live map, km; uses more battery and needs a privacy notice) · only at check-in/check-out points *(recommended for stage 1)*.
8. **No-network sites:** do your employees often work where there is no mobile network? (decides whether offline use moves up to stage 1)
9. **Which stages to build now:** stage 1 only, or 1 + 2 together?

## 7. What would help me build it right

- The **site types** and **visit purposes** your team actually uses (the lists in A8/B3 are my guesses).
- One **example report or checklist** your managers expect after a visit, if you have one.
- One real field employee to pilot stage 1 for a few days before everyone uses it.

---

## 8. Approved decisions (23 Oct 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Sales features | **Delete completely** (orders, products, payments/receipts, targets, leaderboard: code, screens and the empty collections). |
| 2 | Who adds sites | **Anyone in the field, by pinning.** No approval step (A6 dropped). |
| 3 | Selfie at check-in | **A company setting** ("selfie required"), **on by default**; admin can switch it to optional. |
| 4 | Manager approval of reports | **Later.** Not in this build (C6 deferred). |
| 5 | Travel allowance by km | **Yes** (F3 + H1). |
| 6 | Map in the mobile app | **Google Maps**; the company provides the Google Cloud API key. Android now; iOS when the iOS project is available on this machine. The website keeps OpenStreetMap maps (no key needed); switching it to Google is possible later. |
| 7 | Tracking | **Only at check-in and check-out** (day attendance and site visits). Continuous tracking is removed from the app; F4 and B6 are dropped. The team map shows each person's last check-in/out point and status. |
| 8 | No-network sites | **Yes, often.** Offline use (K1) is part of this build. |
| 9 | Stages | Build stages 1–3 together, plus the Android in-app map. Excluded: A6, C6, C7 (signature), F4, B6, the iOS map. |

**Kilometres for travel allowance** (follows from decisions 5 and 7): a day's distance is the road distance between that day's consecutive points: day check-in → each visit's check-in and check-out → day check-out. It is calculated with the Google Routes API when the key is configured. Otherwise, or when Google fails, it is the straight-line distance × 1.3 and marked *estimated*. The employee can correct the km with a reason, and the approver sees both values.
