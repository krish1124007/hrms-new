const xlsx = require('xlsx');

const workbook = xlsx.readFile('D:\\\\sharing-mobile\\\\DDOPC-HRMS-Deploy-new\\\\DDOPC Employee.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

if (data.length > 0) {
  console.log("Headers:", Object.keys(data[0]));
  console.log("First Row:", data[0]);
} else {
  console.log("No data found.");
}
