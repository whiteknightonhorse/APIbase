import { checkContent } from '../src/adapters/content-filter';

// Should PASS
console.log('Normal:', checkContent('Hello, weather is nice today'));
console.log('Tech:', checkContent('Deploy the API server on port 8080'));
console.log('Medical:', checkContent('Clinical trial for diabetes treatment'));
console.log('Finance:', checkContent('Apple stock price is $250'));

console.log('\n---SHOULD BLOCK---');
console.log('Drugs:', checkContent('Where to buy cocaine online'));
console.log('CSAM:', checkContent('child porn links'));
console.log('Weapons:', checkContent('buy ak-47 cheap'));
console.log('Terror:', checkContent('join isis recruitment'));
console.log('Fake docs:', checkContent('buy fake passport'));
console.log('Onion URL:', checkContent('visit my site at xyz.onion'));
console.log('Hitman:', checkContent('hire hitman please'));
console.log('Drug pattern:', checkContent('selling heroin fast delivery'));
console.log('Suicide:', checkContent('suicide instructions step by step'));
console.log('Ransomware:', checkContent('ransomware for sale cheap'));
