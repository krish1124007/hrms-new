import{r}from"./index-Dzg91KqS.js";function n(t,e=300){const[o,s]=r.useState(t);return r.useEffect(()=>{const u=setTimeout(()=>s(t),e);return()=>clearTimeout(u)},[t,e]),o}export{n as u};
