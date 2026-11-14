# kalexibrokerage

KALEXI BROKERAGE LTD

INTERNAL BROKERAGE MANAGEMENT, INTELLIGENCE & OPERATIONS SYSTEM

MASTER BUILD PROMPT

Build a production-ready internal web application for Kalexi Brokerage Ltd.

This is NOT a generic CRM.

The system must function as the company's central:

Client Management System

Brokerage Operations System

Deal Management System

Opportunity Database

Buyer/Supplier Database

KYC & Verification System

Risk & Investigation Register

Research Database

Document Management System

Transaction Management System

Receipt & QR Verification System

Internal Communication/Activity Record

Institutional Archive

Management Intelligence Dashboard

The entire application must be built around Kalexi Brokerage Ltd's operating model:

SOURCE → REGISTER → VERIFY → KYC → RISK CHECK → MATCH → DEAL → DUE DILIGENCE → DOCUMENT → NEGOTIATE → FACILITATE → TRANSACT → CLOSE → ARCHIVE

1. INITIAL SUPER ADMIN

Create the initial bootstrap Super Admin account:

Name: Kalemire Abdulrahuman
Email: kalemireabdul09@gmail.com
Role: SUPER ADMIN

Do NOT hard-code a permanent password into the application or expose a password in source code.

On the first successful login, require the Super Admin to create a secure password.

The Super Admin must then be able to:

Change their password

Reset employee passwords

Create users

Disable users

Reactivate users

Delete users where permitted

Assign roles

Change roles

Create custom roles

Modify permissions

View all users

View all records

View all departments/workspaces

Configure system settings

Manage forms

Manage workflows

Manage document types

Manage categories

Manage risk classifications

View audit logs

Export authorized reports

Archive records

Restore archived records

Manage integrations

Manage security settings

Force password resets

Terminate active sessions

Lock accounts

Unlock accounts

The Super Admin is the highest authority inside the application.

Critical actions must still be written into the immutable audit log.

2. AUTHENTICATION EXPERIENCE

Build a professional corporate login system.

The first screen should request:

Email

When a user enters their email, the system checks whether the email belongs to an active Kalexi user.

If recognized, display a professional identity card containing only authorized identity information:

Profile photograph

Full name

Role

Department/workspace

Appropriate greeting

Example:

Good evening, Sarah.

Client Onboarding Officer

Then display:

Password

The user enters their password.

If correct, open their assigned workspace.

Do NOT reveal sensitive personal information, KYC information, risk records, private notes, salary information, or other restricted information on the login screen.

If the email does not belong to an active user, show:

Account not found or not authorized.

Do not reveal whether a particular email exists to unauthorized users.

3. PASSWORD SECURITY

Implement secure authentication.

Requirements:

Passwords must be hashed.

Never store plain-text passwords.

First-login password creation.

Password reset flow.

Temporary passwords where necessary.

Force password change after administrator reset.

Password strength requirements.

Login attempt protection.

Account lockout after repeated failed attempts.

Session expiration.

Secure logout.

Optional/required 2FA for sensitive roles.

Super Admin should have mandatory 2FA.

Never display passwords anywhere in the database or admin interface.

4. ROLE-BASED ACCESS CONTROL

Build granular RBAC.

The Super Admin creates and assigns roles.

Initial roles:

SUPER ADMIN

Full access.

RECEPTIONIST

Can:

Register new clients

Enter basic client information

Record basic client requirement

Generate client registration acknowledgement

Print registration document

Search using authorized client ID

View limited client registration information

Cannot:

Access full KYC

Access investigations

Access risk cases

Access commissions

Access confidential deal information

Delete clients

Export client database

Close deals

Modify historical registration information

CLIENT ONBOARDING OFFICER

Can:

Complete client profiles

Collect detailed requirements

Upload KYC documents

Request information from clients

Review submitted forms

Update permitted client information

Manage onboarding workflow

DEALS MANAGER

Can:

View approved clients

View client requirements

Create opportunities

Manage opportunities

Match clients with opportunities

Create deals

Manage offers

Manage negotiations

Track deal progress

Upload deal documentation

VERIFICATION OFFICER

Can:

Conduct verification

Review submitted documents

Record verification findings

Manage due diligence checklists

Approve/reject verification stages

Upload verification reports

RISK OFFICER

Can:

Create risk cases

Create investigation cases

Manage risk records

Add evidence

Add investigation notes

Upload supporting documents

Search internal risk records

Flag entities

Clear or escalate cases

Conduct authorized research

Review possible relationships

Risk information must be restricted from ordinary employees.

FINANCE OFFICER

Can:

Record payments

Generate invoices

Generate receipts

Track commissions

Track outstanding balances

View financial information necessary for their role

MANAGEMENT / CEO

Can:

View operational dashboards

View approved business reports

View clients

View opportunities

View deals

View transactions

View performance

Approve designated actions

AUDITOR

Read-only access to authorized records and audit history.

The Super Admin must be able to create additional roles later.

5. CLIENT REGISTRATION WORKFLOW

Build a simple receptionist interface.

The receptionist should see:

REGISTER NEW CLIENT

Fields:

Full name

Phone number

Company name

Client type

Sector

Simple description of what the client wants

The receptionist must NOT be required to collect the entire KYC file.

When submitted, automatically generate:

KBL-CLI-XXXXXX

The client becomes an officially registered Kalexi client record.

Record:

Client ID

Name

Phone

Company

Requirement

Sector

Registration date/time

Registered by

Office/branch if applicable

Status

The receptionist cannot delete the record.

6. CLIENT REGISTRATION DOCUMENT

Immediately generate a printable document.

Title:

KALEXI BROKERAGE LTD

CLIENT REGISTRATION ACKNOWLEDGEMENT

Include:

Kalexi logo

Client ID

Client name

Phone

Company where applicable

Client type

Sector

Basic requirement

Registration date

Registered by

QR code

Document verification reference

Include wording that the document confirms registration in Kalexi's records but does not itself constitute a transaction agreement, ownership confirmation, or guarantee.

Allow:

Print

Generate PDF

Authorized download

7. CLIENT FORM LINK SYSTEM

Build a secure form generator.

Authorized staff should be able to create a form and generate a unique link.

Examples:

Client Registration

Buyer Requirement

Seller Registration

Supplier Registration

Property Submission

Mineral Opportunity

Petroleum Opportunity

Commercial Opportunity

Investor Requirement

KYC Information

Due Diligence Information

Document Update

The system must support:

SEND TO CLIENT

and

FILL INTERNALLY

The same form can therefore be completed:

By the client through a secure link, OR

By an authorized Kalexi employee on behalf of the client.

The form should support:

Required fields

Optional fields

Text

Number

Date

Dropdown

Multiple choice

Checkboxes

File upload

Image upload

Video upload

Document upload

Location

Signature where appropriate

Allow:

Save and continue later

Expiry date

One-time submission

Multiple submission

Form status

Resend link

Submission tracking

8. FORM TRACKING

Track:

Created

Sent

Opened

Started

Saved

Submitted

Reviewed

Approved

Rejected

Changes requested

Show timestamps and responsible users.

9. CLIENT ONBOARDING

After receptionist registration, the client proceeds to the onboarding workspace.

Collect:

Personal information

Full legal name

Contact information

Address

Identification information

Other required KYC information

Corporate information

Company name

Registration number

Directors

Authorized representatives

Beneficial ownership information where required

Company address

Supporting documents

Client requirement

Sector

Requirement

Budget

Location

Quantity

Specifications

Timeframe

Preferred transaction terms

Documents

Allow upload of required documents.

The system must preserve the original receptionist registration record.

10. PRE-CHECK / DUPLICATE DETECTION

When entering:

Name

Phone

Email

Company

Identification reference

Registration number

the system should search existing internal records.

Potential matches should be shown.

Example:

POSSIBLE EXISTING RECORD

Client ID: KBL-CLI-000102

Name: John Doe

Phone: XXX

Relationship: Previous Client

Require authorized employee review before creating a duplicate record.

11. INTERNAL RISK CHECK

When an authorized employee enters a client/person/company/document identifier, automatically search the internal risk and investigation database.

Check:

Name

Alternative names

Phone numbers

Emails

Companies

Identification references

Related entities

Previous cases

Previous disputes

Previous flagged transactions

Related documents

Possible results:

GREEN

No relevant internal match.

AMBER

Possible related record requiring review.

RED

Relevant restricted risk/investigation record requiring authorized review.

Do not automatically label someone a criminal based only on a name or similarity.

All potential matches must be presented as possible matches and reviewed by an authorized Risk/Verification Officer.

12. RISK & INVESTIGATION MODULE

Create a restricted workspace.

Each case receives an ID:

KBL-RISK-XXXXXX

or

KBL-INV-XXXXXX

Store:

Subject

Person/company

Known identifiers

Related companies

Related phone numbers

Related emails

Case type

Date

Report/source

Allegation or concern

Evidence

Documents

Images

Notes

Related transactions

Related clients

Related deals

Investigator

Status

Findings

Resolution

Statuses:

Reported → Under Review → Under Investigation → Verified Finding → Cleared → Escalated → Closed

Keep allegations, investigations and established findings clearly separated.

13. RISK INTELLIGENCE SEARCH

Allow authorized Risk Officers to search:

Exact name

Partial name

Phone

Email

Company

Document number

Case number

Keyword

Location

Description

Implement full-text search over authorized risk records.

If a case contains multiple meaningful terms, searching those terms should return potentially related records.

Example:

Searching:

ABC Minerals

could return cases containing:

ABC Minerals

Associated individuals

Associated phone numbers

Associated companies

Related transactions

Related documents

Clearly label these as related records / possible relationships, not automatic proof.

14. DOCUMENT INTELLIGENCE

When a user uploads a document, the system should:

Store the original file securely

Generate a document ID

Record uploader

Record date/time

Link document to client/deal/opportunity

Extract text using OCR where appropriate

Extract available structured fields

Detect duplicate documents

Compare extracted information with existing records

Flag inconsistencies

Examples:

Document number already exists

Phone number differs from client profile

Company registration number matches another record

Send suspicious inconsistencies to authorized verification/risk users.

15. IMAGE PROCESSING

Support images of:

IDs

Passports

Company documents

Properties

Assets

Evidence

Opportunities

The system may perform:

OCR

Document classification

Duplicate detection

Image quality analysis

Basic tampering indicators

Extraction of visible information

Do not make unsupported autonomous criminal or identity conclusions from facial images.

Any possible identity relationship should be presented to an authorized human reviewer.

16. RESEARCH MODULE

Create a research workspace for authorized users.

A Risk/Research Officer can create:

KBL-RES-XXXXXX

with:

Subject

Research question

Keywords

Related case

Related person/company

Research notes

Sources

Findings

Attachments

Date

Researcher

Where external web research is integrated, preserve:

Source

URL

Date accessed

Extracted finding

Researcher's conclusion

Do not present unverified external information as established fact.

17. OPPORTUNITY DATABASE

Create a centralized opportunity database.

Categories:

Real Estate

Minerals

Petroleum & Energy

Agriculture

Commercial Opportunities

Other approved sectors

Every opportunity receives an ID:

KBL-OPP-XXXXXX

Store:

Type

Sector

Owner/supplier

Location

Description

Price

Quantity

Availability

Requirements

Documents

Images

Videos

Verification status

Source

Assigned employee

Date

Notes

Status

18. VERIFICATION WORKFLOW

Every opportunity should pass through verification where applicable.

Example:

NEW

↓

UNDER REVIEW

↓

DOCUMENTS REQUESTED

↓

VERIFICATION

↓

VERIFIED

or

REJECTED

The exact checklist should depend on sector.

Create configurable checklists for:

Real estate

Minerals

Petroleum

Agriculture

Commercial transactions

19. AUTOMATIC CLIENT-OPPORTUNITY MATCHING

Once an approved client requirement exists, automatically search the opportunity database.

Match using:

Sector

Type

Location

Budget

Quantity

Requirements

Specifications

Availability

Verification status

Show:

MATCH SCORE

and explain the factors behind the score.

Example:

94% Match

Location: 100%

Budget: 95%

Property type: 100%

Size: 85%

Availability: 100%

Do not create a deal automatically. Allow the Deals Manager to review and create the deal.

20. DEAL MANAGEMENT

Every formal deal receives:

KBL-DEAL-XXXXXX

The deal must connect:

Client

Buyer

Seller

Supplier

Opportunity

Property/resource

Documents

Due diligence

Negotiations

Payments

Commission

Receipts

Communications

Tasks

Closing

Audit trail

Deal stages:

SOURCE

→ VERIFY

→ MATCH

→ DOCUMENT

→ NEGOTIATE

→ FACILITATE

→ TRANSACT

→ CLOSE

→ ARCHIVE

Do not allow ordinary users to skip mandatory stages.

21. NEGOTIATION HISTORY

Record every offer and counteroffer.

Never overwrite historical offers.

Store:

Offered amount

Currency

Terms

Offered by

Date/time

Response

Counteroffer

Notes

Create a chronological negotiation timeline.

22. DOCUMENT MANAGEMENT

Create a centralized secure document vault.

Documents must be linked to:

Client

Company

Opportunity

Deal

Transaction

Investigation

Research case

Support:

PDF

DOCX

XLSX

Images

Videos

Other approved formats

Implement:

Version control

Access control

Document status

Verification status

Upload history

Download history

Archive

23. TRANSACTION & FINANCE MODULE

Record:

Invoice

Payment

Transaction

Commission

Refund where authorized

Outstanding balance

Payment reference

Date

Amount

Currency

Related deal

Supporting documents

No payment record should exist without a related client/deal where applicable.

24. RECEIPT GENERATOR

Generate official system receipts.

Every receipt receives:

KBL-RCP-XXXXXX

Include:

Kalexi Brokerage Ltd

Receipt number

Client

Amount

Currency

Purpose

Deal ID

Transaction ID

Payment reference

Date

Authorized user

QR verification code

QR should open an authorized verification page.

Example:

Verify Receipt

→ Receipt ID
→ Status
→ Date
→ Amount
→ Related transaction

Do not expose confidential information through the public QR page.

25. CLOSING WORKFLOW

Before a deal can be marked CLOSED, require the configured closing checklist.

Example:

Required documents completed

Due diligence completed

Required approvals completed

Payment confirmed

Commission recorded

Receipt generated

Closing documents uploaded

Outstanding tasks resolved

Then authorize:

CLOSE DEAL

Record:

Closed by

Approved by

Date/time

Closing reason

Final transaction value

26. ARCHIVE

Never silently delete important business records.

Use:

ACTIVE → COMPLETED → CLOSED → ARCHIVED

Archived records remain searchable by authorized users.

Where deletion is legally necessary, make deletion a privileged action with:

Reason

User

Date/time

Approval where required

Audit record

27. ANTI-OFF-BOOK TRANSACTION CONTROLS

Build the system specifically to reduce unauthorized off-book activity.

Rules:

Every client gets a unique Client ID.

Every opportunity gets a unique Opportunity ID.

Every deal gets a unique Deal ID.

Every payment references the relevant transaction/deal.

Every receipt is system-generated.

Important actions require authorized users.

Employees cannot erase historical records.

All critical actions are logged.

Sensitive data is role-restricted.

Bulk export is restricted.

Deal closure requires required approvals.

Changes to critical information create audit entries.

Employees cannot create unauthorized duplicate client records.

The system should flag transactions that do not follow required workflow.

Management should be able to see all active and recently modified deals.

28. AUDIT LOG

Create an immutable audit log.

Record:

Login

Logout

Failed login

User creation

User deletion/deactivation

Role change

Password reset

Client creation

Client modification

Document upload

Document download

Document deletion/archive

Opportunity creation

Deal creation

Deal modification

Offer creation

Payment creation

Receipt creation

Deal closure

Data export

Form generation

Form submission

Risk case creation

Risk case modification

Each event should include:

User

Timestamp

Action

Record

Previous value where appropriate

New value where appropriate

IP/device/session metadata where legally appropriate

Ordinary users cannot delete or modify audit logs.

29. DATA PROTECTION

Implement strong security.

Requirements:

HTTPS

Secure authentication

Password hashing

Role-based authorization

Database encryption where appropriate

Secure file storage

Signed/expiring file access URLs

Session management

2FA

Rate limiting

Backup system

Disaster recovery

Audit logs

Secure API

Input validation

File scanning

Protection against SQL injection

Protection against XSS

Protection against CSRF where applicable

Never expose database credentials in frontend code.

Never store secrets in public repositories.

30. EMPLOYEE DATA ACCESS

Employees must only see the information necessary for their role.

Examples:

Receptionist:

Basic client information only.

Risk Officer:

Risk and investigation information.

Finance:

Financial information.

Deals Manager:

Client requirements and deal information.

Super Admin:

Full access.

Sensitive fields should be hidden rather than merely disabled in the interface.

31. GLOBAL SEARCH

Build a powerful authorized global search.

Search:

Client ID

Name

Phone

Email

Company

Deal ID

Opportunity ID

Document ID

Transaction ID

Receipt ID

Case ID

Keywords

Search results must respect the user's permissions.

A receptionist searching a risk case should not receive the risk case merely because they know the person's name.

32. MANAGEMENT DASHBOARD

Create dashboards showing real database information.

Metrics:

Total clients

New clients

Active clients

Buyers

Sellers

Suppliers

Opportunities

Verified opportunities

Active deals

Deals in negotiation

Deals closing

Closed deals

Pending payments

Commission

Open investigations

Pending KYC

Expiring documents

Employee activity

No mock data.

No fake statistics.

33. COMPLETE CLIENT PROFILE

When an authorized user opens a client:

Show:

Identity

Registration

Requirements

KYC

Verification

Risk status

Opportunities

Matches

Deals

Negotiations

Documents

Transactions

Receipts

Communications

Tasks

Notes

Audit history

Everything should be connected to the Client ID.

34. COMPANY PROFILE

If the client is a company, create a company record.

Connect:

Company

Directors

Representatives

Beneficial owners where required

Employees/contacts

Documents

Opportunities

Deals

Risk cases

Research

Transactions

Searching the company name should reveal authorized related records.

35. NO MOCK DATA

This is critical.

Do not populate the production system with fake clients, fake deals, fake payments, fake investigations, fake receipts or fake companies.

Use empty states until real data is entered.

Examples:

No clients registered yet.

No active deals.

No pending investigations.

Do not hard-code business records into the frontend.

36. DATABASE ARCHITECTURE

Use a proper relational database such as PostgreSQL.

Core entities should include:

users

roles

permissions

clients

companies

contacts

client_requirements

opportunities

properties

mineral_opportunities

petroleum_opportunities

agricultural_opportunities

buyers

sellers

suppliers

deals

deal_parties

offers

negotiations

due_diligence

verifications

risk_cases

investigations

research_cases

documents

document_versions

media

forms

form_submissions

tasks

communications

transactions

payments

invoices

receipts

commissions

generated_links

qr_codes

audit_logs

notifications

Use proper foreign keys and relationships.

37. USER WORKSPACES

After login, automatically open the user's workspace according to their role.

Receptionist Workspace

Register Client | Search Client | Print Registration

Onboarding Workspace

Clients | Forms | KYC | Documents | Pending Information

Deals Workspace

Requirements | Matches | Opportunities | Deals | Negotiations

Verification Workspace

Pending Verification | Due Diligence | Documents

Risk Workspace

Cases | Investigations | Alerts | Research | Related Records

Finance Workspace

Transactions | Payments | Invoices | Receipts | Commission

Super Admin Workspace

Everything + Users + Roles + Permissions + Settings + Audit Logs

38. USER MANAGEMENT

Super Admin page:

USERS

For each user show:

Profile photo

Name

Email

Role

Department

Status

Last login

Account created

2FA status

Active sessions

Actions:

Create User

Edit User

Reset Password

Change Role

Disable

Enable

Terminate Sessions

Delete where permitted

Every administrative action must be audited.

39. PROFILE LOGIN EXPERIENCE

Use a clean corporate login.

Flow:

EMAIL

↓

System identifies authorized user

↓

Show:

Profile Photo

Name

Role

Greeting

↓

PASSWORD

↓

Authentication

↓

2FA if required

↓

Open correct workspace

The profile information displayed before password authentication must be limited to safe identity information.

40. FINAL SYSTEM PRINCIPLE

The system must enforce this rule:

Every official Kalexi Brokerage client, opportunity, deal, transaction, document and investigation must have a traceable digital record.

The objective is to create a system where:

A receptionist registers the client.

↓

The system creates the official Client ID and registration acknowledgement.

↓

The onboarding officer collects complete information and KYC.

↓

The system checks existing records and internal risk information.

↓

The verification/risk team conducts appropriate checks.

↓

The Deals Manager receives the client's requirements.

↓

The system automatically searches for matching opportunities.

↓

A deal is created when appropriate.

↓

Due diligence, documentation and negotiations are recorded.

↓

Finance records payments and generates system receipts.

↓

Authorized management closes the deal.

↓

The complete record becomes part of Kalexi's permanent institutional archive.

41. DEVELOPMENT STANDARD

Build this as a serious production system.

Do NOT:

Use mock business data

Hard-code users into frontend logic

Hard-code permissions

Store passwords in plain text

Allow ordinary users to bypass workflow

Allow unauthorized database exports

Allow silent deletion

Expose restricted information through search

Create fake analytics

Create fake verification results

Automatically accuse people of crimes based on similarity

Treat unverified research as fact

The architecture must be scalable, secure, auditable and maintainable.

The UI should be professional, fast, responsive and usable on desktop, tablet and mobile.

The final product should feel like a professional brokerage operations platform, not a generic admin dashboard.

Brand: Kalexi Brokerage Ltd

Primary purpose: Source, verify, match, document, negotiate, facilitate, close and archive commercial transactions while protecting Kalexi's data, processes and institutional records.

Hosted on Vercel, backed by Supabase (project `alxpwbqthlrexrbycqjp`). See DEPLOY.md.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
