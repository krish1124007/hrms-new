const xlsx = require('xlsx');

const workbook = xlsx.readFile('D:\\\\sharing-mobile\\\\DDOPC-HRMS-Deploy-new\\\\DDOPC Employee.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

const designations = new Set();
data.forEach(row => {
  if (row.Designation) designations.add(row.Designation);
});

console.log(Array.from(designations));
