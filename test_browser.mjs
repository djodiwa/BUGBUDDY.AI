import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

  try {
    await page.goto('http://localhost:8080/', { waitUntil: 'load', timeout: 30000 });
  } catch(e) {
    console.log("Goto error:", e.message);
  }
  
  await new Promise(r => setTimeout(r, 5000));
  
  const bodyText = await page.evaluate(() => document.body.innerHTML);
  console.log('BODY HTML LENGTH:', bodyText.length);
  if (bodyText.length < 5000) console.log('BODY HTML SNIPPET:', bodyText);
  
  await browser.close();
})();
