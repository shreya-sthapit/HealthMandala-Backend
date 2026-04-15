const puppeteer = require('puppeteer-core');

const CHROME_PATH = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NMC_URL = 'https://www.nmc.org.np/search-registered-doctor/';

/**
 * Verify a doctor's NMC registration using headless Chrome.
 * Searches by NMC number and checks if the doctor's name matches.
 */
const verifyNMCDoctor = async (nmcNumber, firstName, lastName) => {
  // Basic format check
  const nmc = (nmcNumber || '').toString().trim();
  if (!nmc || !/^\d{1,8}$/.test(nmc)) {
    return { verified: false, reason: 'NMC Registration Number must be numeric (up to 8 digits).' };
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: 30000,
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    await page.setDefaultTimeout(20000);

    await page.goto(NMC_URL, { waitUntil: 'networkidle2' });

    // Type NMC number into the symbolNo field
    await page.waitForSelector('input[name="symbolNo"]');
    await page.click('input[name="symbolNo"]', { clickCount: 3 });
    await page.type('input[name="symbolNo"]', nmc, { delay: 30 });

    // Click the Search button
    await page.click('button.btn-primary');

    // Wait for Blazor to update the DOM
    await new Promise(r => setTimeout(r, 4000));

    // Extract result text from the result container
    const resultText = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.innerText.toLowerCase() : document.body.innerText.toLowerCase();
    });

    // No result found
    if (
      resultText.includes('no result') ||
      resultText.includes('not found') ||
      resultText.includes('no record') ||
      !resultText.includes(nmc)
    ) {
      return {
        verified: false,
        reason: `NMC number ${nmc} is not registered with Nepal Medical Council. Please verify your NMC number at nmc.org.np.`
      };
    }

    // NMC number found — check if name matches
    const first = firstName.toLowerCase().trim();
    const last = (lastName || '').toLowerCase().trim();

    const nameFound = resultText.includes(first) ||
                      (last.length > 1 && resultText.includes(last));

    if (!nameFound) {
      return {
        verified: false,
        reason: `NMC number ${nmc} is registered to a different doctor. Your name does not match the NMC records. Please check your name matches your NMC registration exactly.`
      };
    }

    // Both NMC number and name match
    return { verified: true, doctorName: `${firstName} ${lastName}`.trim() };

  } catch (error) {
    console.error('NMC verification error:', error.message);
    // If browser/network fails, fail open — admin reviews manually
    return {
      verified: true,
      skipped: true,
      reason: 'NMC verification service temporarily unavailable — admin will review manually.'
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

module.exports = { verifyNMCDoctor };
