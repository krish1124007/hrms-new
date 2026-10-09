const xlsx = require('xlsx');

const workbook = xlsx.readFile('D:\\\\sharing-mobile\\\\DDOPC-HRMS-Deploy-new\\\\DDOPC Employee.xlsx');
const sheet = workbook.Sheets['Site Engineer'];
if (!sheet) {
  console.log('Sheet "Site Engineer" not found.');
  process.exit(1);
}

const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });

const transformed = data.map(row => {
  // Parse name
  const fullName = (row['Full Name'] || '').trim();
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Name';
  
  // Format joining date (YYYY-MM-DD or MM/DD/YYYY)
  let joining = row['Date of Joining'] || '';
  if (typeof joining === 'number') {
    const d = xlsx.SSF.parse_date_code(joining);
    if (d) joining = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  } else if (typeof joining === 'string' && joining.includes('-')) {
    // e.g. 17-02-2023 -> 2023-02-17
    const parts = joining.split('-');
    if (parts.length === 3) {
       // if DD-MM-YYYY
       if (parts[2].length === 4) joining = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  // Format DOB
  let dob = row['Date of Birth'] || '';
  if (typeof dob === 'number') {
    const d = xlsx.SSF.parse_date_code(dob);
    if (d) dob = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  } else if (typeof dob === 'string' && dob.includes('-')) {
    const parts = dob.split('-');
    if (parts.length === 3) {
       if (parts[2].length === 4) dob = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  
  // Status
  let statusStr = (row['Employee Status'] || '').trim().toLowerCase();
  let status = 'active';
  if (statusStr.includes('inactive')) status = 'inactive';
  else if (statusStr.includes('term')) status = 'terminated';
  else if (statusStr.includes('resign')) status = 'resigned';
  else if (statusStr.includes('notice')) status = 'onNotice';

  // Employment type
  let empTypeStr = (row['Employment Type'] || '').trim().toLowerCase();
  let empType = 'full-time';
  if (empTypeStr.includes('part')) empType = 'part-time';
  else if (empTypeStr.includes('contract')) empType = 'contract';
  else if (empTypeStr.includes('intern')) empType = 'intern';
  else if (empTypeStr.includes('permanent')) empType = 'full-time';

  // Gender
  let gender = (row['Gender'] || '').trim().toLowerCase();
  if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
    gender = 'male'; // fallback
  }

  return {
    'First Name': firstName,
    'Last Name': lastName,
    'Email': row['Email'] ? row['Email'].toString().trim() : '',
    'Joining Date': joining,
    'Phone': row['Phone Number*'] ? row['Phone Number*'].toString().trim() : '',
    'Date of Birth': dob,
    'Gender': gender,
    'Department': (row['Department'] || '').trim(),
    'Designation': (row['Designation'] || '').trim(),
    'Status': status,
    'Employment Type': empType,
    'Work Location': (row['City'] || '').trim(),
    'Bank Name': (row['Bank Name'] || '').trim(),
    'Account Number': row['Account Number'] ? row['Account Number'].toString().trim() : '',
    'IFSC Code': (row['IFSC / BIC / SWIFT Code'] || '').trim(),
    'Emergency Contact Name': (row['Emergency Contact Name'] || '').trim(),
    'Emergency Contact Relation': (row['Relationship'] || '').trim(),
    'Emergency Contact Phone': row['Emergency Phone Number'] ? row['Emergency Phone Number'].toString().trim() : ''
  };
});

const outWorkbook = xlsx.utils.book_new();
const outSheet = xlsx.utils.json_to_sheet(transformed);
xlsx.utils.book_append_sheet(outWorkbook, outSheet, 'Employees');

const outPath = 'D:\\\\sharing-mobile\\\\DDOPC-HRMS-Deploy-new\\\\Site_Engineers_Import_Format.xlsx';
xlsx.writeFile(outWorkbook, outPath);

console.log(`Successfully generated ${outPath} with ${transformed.length} records in standard import format.`);
