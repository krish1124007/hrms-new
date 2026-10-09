const xlsx = require('xlsx');

const workbook = xlsx.readFile('D:\\\\sharing-mobile\\\\DDOPC-HRMS-Deploy-new\\\\DDOPC Employee.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

const siteEngineers = data.filter(row => {
  if (!row.Designation) return false;
  return row.Designation.toString().toLowerCase().includes('site engineer');
});

const transformedData = siteEngineers.map(row => {
  // Extract name from Account Holder if available, else default
  const fullName = row['Account Holder'] ? row['Account Holder'].toString().trim() : 'Unknown Name';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Name';
  
  // Format joining date if it's an excel serial number
  let joiningDate = '';
  if (row.DOJ) {
    if (typeof row.DOJ === 'number') {
      const date = xlsx.SSF.parse_date_code(row.DOJ);
      if (date) {
        joiningDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    } else {
      joiningDate = row.DOJ;
    }
  } else {
    joiningDate = '2024-01-01'; // Default required field
  }
  
  // Fake email based on name
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;

  return {
    'First Name': firstName,
    'Last Name': lastName,
    'Email': email,
    'Joining Date': joiningDate,
    'Phone': row.Phone || '',
    'Department': row.Dept || '',
    'Designation': row.Designation || '',
    'Status': row.Status || 'active',
    'Employee ID': row['Employee ID'] || '',
    'Bank Name': row['Bank Name'] || '',
    'Account Number': row['Account No'] || ''
  };
});

const newWorkbook = xlsx.utils.book_new();
const newSheet = xlsx.utils.json_to_sheet(transformedData);
xlsx.utils.book_append_sheet(newWorkbook, newSheet, 'Site Engineers');
const outPath = 'D:\\\\sharing-mobile\\\\DDOPC-HRMS-Deploy-new\\\\Site_Engineers_Import.xlsx';
xlsx.writeFile(newWorkbook, outPath);

console.log(`Successfully generated ${outPath} with ${transformedData.length} records.`);
