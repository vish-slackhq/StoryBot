let str = '/mediasource thingy';
let test = str.match(/(\/.*(?=\s)) .*/);
console.log('test:',test);
console.log('test[0]:',test[0]);
console.log('test[1]:',test[1]);
console.log('test[2]:',test[2]);
