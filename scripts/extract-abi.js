const fs = require('fs');
const path = require('path');

const contractPath = path.join(process.cwd(), 'contracts/zkout/PredictionMarket.sol/PredictionMarket.json');
const outputPath = path.join(process.cwd(), 'lib/abi.ts');

try {
  const data = fs.readFileSync(contractPath, 'utf8');
  const json = JSON.parse(data);
  const abi = json.abi;

  const fileContent = `export const PREDICTION_MARKET_ABI = ${JSON.stringify(abi, null, 2)} as const;`;
  fs.writeFileSync(outputPath, fileContent);
  console.log('ABI extracted successfully');
} catch (err) {
  console.error('Error extracting ABI:', err);
}
