# Noor Autos

The dealership system for **Noor Autos & Imports Ltd**, an authorized BYD dealer in Bangladesh.
It follows the *NAIL Business Process Flowchart* and adds the management approvals, role-based access and back
office the flowchart left out.

## Two ways to run it

### A. Shared by the whole team (recommended)
One office computer runs a small server. Everyone else opens it in their browser, signs in with their name and a
PIN, and sees only what their job needs.

1. **On the office computer** that stays on during working hours, double-click **`Start shared server (Mac).command`**
   (on Windows: **`Start shared server (Windows).bat`**, which needs Python 3 from python.org; a Mac already has it).
   A window opens and shows two addresses. Keep that window open.
   - If the Mac asks whether to allow incoming connections, choose **Allow**.
2. **On that computer**, open `http://localhost:8765`. The first time, choose **An empty system** (it is already
   chosen) and create the Managing Director's sign-in (name and PIN). *Demo data* is only for practice.
3. **On every other computer, laptop or phone in the office**, open the second address it printed,
   for example `http://192.168.1.20:8765`. Bookmark it, or on a phone use *Add to Home Screen*.
4. **Set it up**, in this order:
   - **Settings → General**: company details, VAT rate, office hours and public holidays.
   - **Settings → Models & prices**: the BYD models you sell and their list prices.
   - **People**: add your staff (name, job title, phone).
   - **Settings → Sign-in and roles**: pick each person, check their role and give them a starting PIN. They can
     change it by clicking their name at the bottom of the menu.
   - **Settings → Approval rules**: check the limits (discounts, expenses and so on).

### B. One computer only
Double-click `index.html`. It starts empty (to practise first, use **Settings → Data → Load demo data**, then start
fresh from the same place). Data is kept **inside that browser on that computer** and is not shared. On one computer
the app always runs as the Managing Director, so roles and approvals by other people only come into play in shared
mode. Clearing the browser's site data erases everything, so use **Settings → Data → Download backup** regularly.

### C. Online
To reach it from anywhere, put it on a rented server ([HOSTING.md](HOSTING.md)) or on Vercel ([VERCEL.md](VERCEL.md)).

## Who sees what

| Role | Sees | Decides |
|---|---|---|
| **Managing Director** | Everything | Big discounts, car before full payment, cancellations and refunds, purchase orders, emergency purchases, large parts orders, stock write-offs, large expenses, payroll, Admin & HR's own leave |
| **Sales Manager** | All leads, customers, orders and stock. Purchasing read-only (arrival dates, demand) | Discounts up to the manager limit, handing a customer to another consultant |
| **Sales Consultant** | **Only their own** leads, customers, orders, payments and follow-ups, and the customer of each of their orders. Stock availability without costs. Their targets (read-only) | Asks for approval |
| **Accounts** | Orders, payments, suppliers, expenses, invoices, VAT returns. People: staff (read-only) and salaries to pay. No leads | Confirms customer money (cash handed over, cheque cleared), smaller expenses |
| **Procurement & Stock** | Purchase orders, vehicles (with costs), parts, the Stock age report. Leads only as model and stage, to plan stock (no names or numbers) | Prepares; the MD approves and Accounts pays |
| **Service Manager / Service** | Workshop, job cards, warranty, parts (selling prices), workshop money (not car-sale payments) | Service Manager: free warranty jobs, service discounts |
| **Admin & HR** | Staff, attendance, leave, payroll, assets, licences | Leave |

The office server enforces this. A consultant's browser never receives another consultant's records, cost prices
or salaries, and the server refuses changes a role is not allowed to make. For example, only Accounts (and the
Managing Director) can mark customer money as confirmed: everyone else's receipts start as "waiting for Accounts",
and nobody else can change a receipt's amount afterwards. Every change is also written to a permanent change log that
only the Managing Director can read (**Settings → Activity log**).

When someone leaves (marked as left in **People**), their sign-in stops working at once.

The Managing Director can click their name at the bottom of the menu and choose **See the app as…** to view the app
exactly as any staff member sees it, using the role of that person's sign-in. Nothing is saved while previewing.

## Approvals

Steps that cost real money go to the right person first. They appear in **Approvals** (with a red count in the
menu), and the record shows a banner until someone decides. If you have the authority yourself, it is approved at
once and logged.

- **Discount on a car:** up to ৳20,000 needs no approval; up to ৳1,00,000 goes to the Sales Manager; above that,
  the Managing Director.
- **Car before full payment** (corporate PO, bank loan on the way): Managing Director. The approval covers the
  amount still owed when it was asked for; if the price goes up or a payment bounces later, it has to be asked again.
- **Discount on a quotation:** an approved discount counts for the model that was quoted. Booking another model needs
  its own approval.
- **Cancel an order and refund:** Managing Director. Accounts then pays the refund.
- **Customer hand-over** to another consultant: Sales Manager.
- **Customer money counts only after Accounts confirms it** (cash handed over, cheque cleared). A VIN is given only
  after 100% confirmed payment. When a cheque or transfer number is already on another receipt, the app warns whoever
  enters it, and Accounts sees "same reference as …" before confirming.
- **Purchase order** (before the advance, 30% by default) and **emergency purchase** (CG Runner): Managing Director.
  The approved purchase order covers its supplier payments.
- **Parts order** above the limit (৳1,00,000 by default): Managing Director.
- **Free warranty work** and **service discounts:** Service Manager (large service discounts: Managing Director).
- **Stock write-off:** Managing Director.
- **Expenses:** small ones need nothing; then Accounts; large ones go to the Managing Director. Nobody approves their
  own claim (Accounts' own claims go to the Managing Director).
- **Leave:** Admin & HR (their own leave: Managing Director). Fridays and the public holidays in **Settings → General**
  are not counted. **Monthly payroll:** Managing Director; Accounts then pays the approved month.

The Managing Director changes the limits in **Settings → Approval rules**.

## How the shared server behaves
- **Live updates.** Changes appear on everyone's screen within a few seconds. The **Live · 3 online** chip shows who
  is connected.
- **No overwriting.** If two people change different parts of the same record at the same time, both changes are kept.
- **No duplicate numbers.** Document numbers come from the server and never repeat, even after restoring a backup.
- **Duplicate customers.** When a consultant enters a mobile number that already belongs to someone else's customer,
  the app says whose it is and offers to ask the Sales Manager for a hand-over.
- **Connection drops.** The chip turns red ("Offline"). Keep the tab open, and the changes are saved when the
  connection is back.
- **Data and backups.** Everything is in `data/noor-dms.sqlite` on the server computer.
  - A copy is saved every day in `data/backups/` (the last 30 days are kept).
  - An extra copy is saved just before anyone restores a backup or resets the data.
  - Copy the `data` folder to a USB drive or cloud drive now and then.
- **Restart.** If the server computer restarts, double-click the start file again. To start it automatically, add
  it to the computer's login items (Mac) or Startup folder (Windows).

It is meant for the office network. Do not open port 8765 to the internet on your router. To use it from another
branch, connect the branches over a VPN, or move the server to a small cloud machine with HTTPS:
**HOSTING.md** explains what to buy and how to install it.

## Office hours and holidays
**Settings → General** holds the office start time, when someone counts as late, and the public holidays. Fridays and
those holidays are days off for attendance, leave and workshop bookings.

## Appearance
Light and dark appearance follow the computer's setting. To change it for one computer, click your name at the
bottom of the menu.

## Code map
- `server.py`: the shared office server (Python 3, standard library only): sign-in, roles, what each role receives,
  the database, live sync, the change log and backups.
- `js/core.js`: data store, process definitions (`NA.FLOW`), business rules (`NA.biz`), UI kit, router.
- `js/access.js`: roles, permissions (`NA.can`), record ownership, the preview mode.
- `js/approvals.js`: approval kinds, limits (`NA.policy`), requests, decisions and banners.
- `js/sync.js`: shared mode in the browser: sign-in screens, sending changes, pulling others' changes, sign-ins tab.
- `js/seed.js`: the demo data.
- `js/app.js`: the menu, search, the "New" menu, your menu and start-up.
- `js/pages/*.js`: one file per screen.
- `css/app.css`: the design system (light and dark).
