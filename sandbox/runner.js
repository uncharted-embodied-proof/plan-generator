// runner.js
const fs = require('fs');
const vm = require('vm');

// Load JSON files into global variables
const world = JSON.parse(fs.readFileSync('./world.json', 'utf8'));
const plans = JSON.parse(fs.readFileSync('./plans.json', 'utf8'));

// Read code from STDIN
let inputCode = '';
process.stdin.on('data', chunk => inputCode += chunk);
process.stdin.on('end', () => {
  try {
    // Create a VM context with preloaded globals
    const context = vm.createContext({ world, plans, console, setTimeout });

    // Run user code in the context
    const result = vm.runInContext(inputCode, context, { timeout: 10000 } );

    // Output the result
    console.log(JSON.stringify({ result }));
  } catch (err) {
    if (err.message.includes('Script execution timed out')) {
      console.error(JSON.stringify({ error: 'Execution timed out after 10 seconds' }));
    } else {
      console.error(JSON.stringify({ error: err.message }));
    }
  }
});


/* Async version
process.stdin.on('end', async () => {
  try {
    // Create a VM context with preloaded globals
    const context = vm.createContext({ world, plans, console, setTimeout, Promise });

    // Run user code in the context
    const IIFE = `
    (async () => {
      ${inputCode}
    })()      
    `;
    const resultPromise = vm.runInContext(IIFE, context, { timeout: 100 } );
    const result = await resultPromise;

    // Output the result
    console.log(JSON.stringify({ result }));
  } catch (err) {
    if (err.message.includes('Script execution timed out')) {
      console.error(JSON.stringify({ error: 'Execution timed out after 10 seconds' }));
    } else {
      console.error(JSON.stringify({ error: err.message }));
    }
  }
});
*/
