# Getting Started

This guide walks you through setting up DD HRMS from scratch, creating your first tenant, and configuring the core HR modules.

---

## System Requirements

| Requirement | Version |
|---|---|
| Node.js | >= 22.0.0 (LTS) |
| npm | >= 10.0.0 |
| Docker | >= 24.0 |
| Docker Compose | >= 2.20 |
| OS | macOS, Linux, or Windows (WSL2) |
| RAM | 8 GB minimum (16 GB recommended) |
| Disk | 10 GB free space |

---

## Installation

### Step 1: Clone the Repository

```bash
git clone <repository-url> opencore-bs
cd opencore-bs
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs dependencies for all workspaces (API, Web, Mobile, Website, Shared, Config) via npm workspaces.

### Step 3: Start Infrastructure Services

Start MongoDB, Redis, Meilisearch, and MinIO using Docker Compose:

```bash
docker compose -f docker/docker-compose.yml up -d mongodb redis meilisearch minio
```

Verify all services are running:

```bash
docker compose -f docker/docker-compose.yml ps
```

You should see four containers in a healthy state.

### Step 4: Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and update these values at minimum:

```bash
# Generate secure random strings for JWT secrets
JWT_SECRET=<random-string-min-32-chars>
JWT_REFRESH_SECRET=<different-random-string-min-32-chars>
```

For local development, the remaining defaults work out of the box with the Docker-based infrastructure.

### Step 5: Build Shared Packages

The API and Web apps depend on `@opencore/shared`. Build it first:

```bash
npm run build --workspace=packages/shared
```

### Step 6: Seed the Database (Optional)

Populate the database with sample data including a demo tenant, users, and sample records:

```bash
npm run seed --workspace=apps/api
```

### Step 7: Start Development Servers

```bash
npm run dev
```

Turborepo starts all apps in parallel:

| App | URL |
|---|---|
| Web Dashboard | http://localhost:5173 |
| API Server | http://localhost:4000 |
| API Docs | http://localhost:4000/api/docs |

---

## First Tenant Setup

After starting the application, you need to create your first tenant (organization).

### 1. Register an Account

Navigate to http://localhost:5173 and complete the registration form:

- **Organization Name**: Your company name
- **Admin Email**: Your email address
- **Password**: Minimum 8 characters with mixed case, numbers, and symbols
- **Subdomain**: A unique subdomain for your organization (e.g., `acme`)

This creates a new tenant and sets you up as the Super Admin.

### 2. Complete Organization Profile

After logging in, navigate to **Settings > Organization** and fill in:

- Company address
- Phone number
- Tax identification numbers (GST, PAN, etc.)
- Logo upload
- Fiscal year settings
- Default currency and timezone

### 3. Configure Departments

Go to **Settings > Departments** and create your organizational structure:

1. Click **Add Department**
2. Enter department name, code, and parent department (if any)
3. Assign a department head
4. Repeat for all departments

---

## Adding Employees

### 1. Navigate to HR > Employees

Click **Add Employee** and fill in the required fields:

- **Personal Information**: Name, email, phone, date of birth, gender
- **Employment Details**: Employee ID, designation, department, date of joining
- **Compensation**: Salary structure, bank account details
- **Documents**: Upload ID proofs, offer letter, etc.

### 2. Bulk Import

For large teams, use the bulk import feature:

1. Go to **HR > Employees > Import**
2. Download the CSV template
3. Fill in employee data
4. Upload the completed CSV
5. Review and confirm the import

### 3. Invite Employees

After adding employees, invite them to self-service:

1. Select employees from the list
2. Click **Send Invite**
3. Employees receive an email to set up their password

---

## Configuring Attendance

### 1. Set Up Attendance Policy

Navigate to **HR > Attendance > Settings**:

- **Work Hours**: Define standard work hours (e.g., 9:00 AM - 6:00 PM)
- **Grace Period**: Late arrival buffer (e.g., 15 minutes)
- **Half Day Rules**: Define when a half day is recorded
- **Overtime Policy**: Enable/disable overtime tracking and rates

### 2. Configure Shifts (Optional)

If your organization uses multiple shifts:

1. Go to **HR > Shifts**
2. Create shift definitions (e.g., Morning, Afternoon, Night)
3. Assign shifts to employees or departments

### 3. Attendance Methods

DD HRMS supports multiple attendance capture methods:

- **Web Check-in**: Employees mark attendance from the dashboard
- **Mobile App**: GPS-verified check-in/out from the mobile app
- **Biometric Integration**: Connect via API to biometric devices
- **Manual Entry**: HR can manually record attendance

---

## Configuring Leave Management

### 1. Create Leave Types

Navigate to **HR > Leave > Settings > Leave Types**:

| Leave Type | Suggested Defaults |
|---|---|
| Casual Leave | 12 days/year |
| Sick Leave | 12 days/year |
| Earned/Privilege Leave | 15 days/year |
| Maternity Leave | 26 weeks |
| Paternity Leave | 15 days |
| Compensatory Off | As earned |

### 2. Set Up Leave Policies

For each leave type, configure:

- Annual allocation
- Carry forward rules
- Encashment policy
- Applicable to (all employees, specific departments, or designations)
- Approval workflow (manager, HR, or skip-level)

### 3. Assign Leave Balances

If starting mid-year, manually adjust balances:

1. Go to **HR > Leave > Balances**
2. Select the period
3. Adjust opening balances per employee

---

## Processing First Payroll

### 1. Configure Salary Structure

Navigate to **Finance > Payroll > Salary Components**:

**Earnings:**
- Basic Salary
- House Rent Allowance (HRA)
- Dearness Allowance (DA)
- Special Allowance
- Conveyance Allowance

**Deductions:**
- Provident Fund (PF)
- Professional Tax
- Income Tax (TDS)
- Employee State Insurance (ESI)

### 2. Create Salary Templates

1. Go to **Finance > Payroll > Salary Templates**
2. Create templates for each pay grade
3. Define component percentages or fixed amounts
4. Assign templates to employees

### 3. Run Payroll

1. Navigate to **Finance > Payroll > Process**
2. Select the pay period (month/year)
3. System auto-fetches attendance, leaves, and overtime data
4. Review the calculated salary for each employee
5. Make adjustments if needed (bonuses, deductions, reimbursements)
6. Click **Process Payroll**
7. Generate payslips (PDF)
8. Initiate bank transfer file

### 4. Post-Payroll

- **Payslips**: Employees can view and download payslips from self-service
- **Reports**: Generate statutory reports (PF returns, ESI returns, TDS)
- **Journal Entry**: Auto-post payroll journal entry to the general ledger

---

## Next Steps

- Set up **CRM** modules for sales pipeline management
- Configure **Project Management** for task and project tracking
- Enable **AI features** by adding OpenAI or Gemini API keys
- Install the **Mobile App** for on-the-go access (see [mobile-setup.md](mobile-setup.md))
- Review the [API Reference](api-reference.md) for integration development
- Set up [Monitoring](deployment.md#monitoring) for production readiness
