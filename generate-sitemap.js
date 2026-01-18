const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://axon-by-aldebarang13.web.app'; // what to add to

//scan the whole website directory
const files = fs.readdirSync('.');

const excludedFiles = [
    '404.html', 
    'template.html', 
    'google1612b078243bdb74.html', // google site verification file
    'index.html'       // we dont really need the login page indexed right?
];

//find only the html files
const pages = files
    .filter(file => file.endsWith('.html'))
    .filter(file => !excludedFiles.includes(file)) //dont index these pls
    .map(file => file.replace('.html', '')); //we dont need the .html part in the sitemap

//make the sitemap
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages.map(page => `
  <url>
    <loc>${BASE_URL}/${page === 'home' || page === 'index' ? '' : page}</loc>
    <changefreq>weekly</changefreq>
    <priority>${page === 'home' || page === 'index' ? '1.0' : '0.8'}</priority>
  </url>`).join('')}
</urlset>`;

// save it to sitemap.xml
fs.writeFileSync('./sitemap.xml', sitemap);
console.log(`🚀 Neural Link Established: ${pages.length} pages mapped to sitemap.xml`);