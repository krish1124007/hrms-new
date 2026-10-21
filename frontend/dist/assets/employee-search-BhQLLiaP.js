function m(e,o){const t=o.trim().toLowerCase();return t?[`${e.firstName} ${e.lastName}`,e.employeeId,e.email].some(r=>(r??"").toLowerCase().includes(t)):!0}export{m};
