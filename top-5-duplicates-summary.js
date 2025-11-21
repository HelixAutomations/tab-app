// TOP 5 DUPLICATE IDs - Extracted from comprehensive analysis

console.log('🚨 TOP 5 WORST DUPLICATE ID CASES');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const top5Cases = [
  {
    id: '23849',
    count: 153,
    daySpan: 246,
    dateRange: '2024-12-19 to 2025-08-22',
    description: 'Massive ID collision - nearly daily duplicates over 8+ months'
  },
  {
    id: '19428', 
    count: 118,
    daySpan: 278,
    dateRange: '2024-03-13 to 2024-12-16',
    description: 'Heavy usage over 9+ months - multiple enquiries per week'
  },
  {
    id: '25479',
    count: 44, 
    daySpan: 207,
    dateRange: '2025-04-03 to 2025-10-27',
    description: 'Consistent collision pattern over 6+ months'
  },
  {
    id: '27474',
    count: 41,
    daySpan: 76, 
    dateRange: '2025-08-22 to 2025-11-06',
    description: 'Rapid-fire duplicates - very recent high-frequency usage'
  },
  {
    id: '18900',
    count: 20,
    daySpan: 654,
    dateRange: '2024-01-22 to 2025-11-06', 
    description: 'Long-term gradual accumulation over 21+ months'
  }
];

top5Cases.forEach((caseData, index) => {
  console.log(`🔴 #${index + 1} - ID ${caseData.id}`);
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log(`   📊 Records: ${caseData.count} duplicates`);
  console.log(`   📅 Span: ${caseData.daySpan} days (${caseData.dateRange})`);
  console.log(`   ⚠️  Impact: ${caseData.description}`);
  console.log(`   📈 Rate: ~${(caseData.count / caseData.daySpan).toFixed(2)} duplicates per day`);
  console.log('');
});

console.log('📊 KEY INSIGHTS FROM TOP 5 CASES:');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('• ID 23849: System appears to be systematically reusing this ID');
console.log('• ID 19428: Another systematic reuse case - likely a default/fallback ID');  
console.log('• ID 25479: Recent pattern suggests ongoing ID generation issue');
console.log('• ID 27474: High frequency in short time = acute current problem');
console.log('• ID 18900: Long-term pattern shows this isn\'t a new issue');
console.log('');
console.log('💡 RECOMMENDATION: These top 5 IDs alone account for 376 duplicate records.');
console.log('   Priority should be investigating what\'s causing systematic reuse of');
console.log('   specific ID values, particularly 23849 and 19428.');
console.log('');
console.log('🚨 URGENT: ID 27474 shows the problem is accelerating (41 dupes in 76 days)');