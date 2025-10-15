/**
 * Email V2 Testing Utilities
 * 
 * Comprehensive testing tools for comparing V1 vs V2 email processing
 * and ensuring production safety during migration.
 */

import EmailProcessor from './EmailProcessor';
import { EMAIL_V2_CONFIG } from './emailFormattingV2';

interface TestResult {
  testName: string;
  input: string;
  v1Output: string;
  v2Output: string;
  differences: string[];
  passed: boolean;
  issues: string[];
  recommendations: string[];
}

interface TestSuite {
  suiteName: string;
  results: TestResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    issues: string[];
    overallRecommendation: string;
  };
}

/**
 * Test cases covering the main production issues
 */
const EMAIL_TEST_CASES = [
  {
    name: 'Line Break Preservation',
    input: `Hello Luke,

Thank you for your enquiry.

The purpose of this email is to briefly follow up on our conversation.

Best regards`,
    expectedImprovements: ['Better paragraph spacing', 'Preserved line breaks']
  },
  {
    name: 'Currency Formatting (Red Number Prevention)',
    input: `<p>Our estimated fee for this matter is £1,500 + VAT.</p><p>Initial consultation: £250</p><p>Hourly rate: £450 + VAT</p>`,
    expectedImprovements: ['No red number formatting', 'Explicit color styling']
  },
  {
    name: 'Long Content (Horizontal Scroll Prevention)',
    input: `<p>This is a very long line of text that might cause horizontal scrolling in email clients if not properly wrapped and formatted with appropriate width constraints and responsive design principles.</p>`,
    expectedImprovements: ['Mobile responsive', 'Width constraints', 'Word wrapping']
  },
  {
    name: 'Rich Text Formatting',
    input: `<h2>Proposal Summary</h2><p><strong>Matter:</strong> Property Transaction</p><ul><li>Due diligence review</li><li>Contract preparation</li><li>Completion assistance</li></ul><p><em>Timeline: 2-3 weeks</em></p>`,
    expectedImprovements: ['Enhanced headings', 'Better list formatting', 'Consistent spacing']
  },
  {
    name: 'Links and Contact Information',
    input: `<p>Please review our proposal and <a href="https://instruct.helix-law.com/pitch/ABC123">instruct us</a> if you wish to proceed.</p><p>Contact: solicitor@helix-law.com</p>`,
    expectedImprovements: ['Better link styling', 'Email client compatibility']
  },
  {
    name: 'Mixed Content with Manual Formatting',
    input: `<h3>Service Overview</h3>

<p>Our services include:</p>

<ul>
<li>Initial consultation (£250)</li>
<li>Document review</li>
<li>Legal advice and guidance</li>
</ul>

<p>Total estimated cost: £1,750 + VAT</p>


<p>Kind regards,<br>The Helix Team</p>`,
    expectedImprovements: ['Preserved spacing', 'Protected numbers', 'Better structure']
  }
];

/**
 * Main testing class
 */
export class EmailV2Tester {
  private results: TestResult[] = [];

  /**
   * Run all test cases and return comprehensive results
   */
  async runAllTests(): Promise<TestSuite> {
    console.log('[EmailV2Tester] Starting comprehensive email formatting tests...');
    
    this.results = [];

    for (const testCase of EMAIL_TEST_CASES) {
      const result = await this.runSingleTest(testCase.name, testCase.input);
      this.results.push(result);
    }

    const summary = this.generateSummary();

    return {
      suiteName: 'Email V2 vs V1 Comparison',
      results: this.results,
      summary
    };
  }

  /**
   * Run a single test case
   */
  private async runSingleTest(testName: string, input: string): Promise<TestResult> {
    console.log(`[EmailV2Tester] Running test: ${testName}`);

    try {
      const comparison = EmailProcessor.compareSystemOutputs(input);
      
      const issues = this.detectIssues(input, comparison.v1, comparison.v2);
      const recommendations = this.generateRecommendations(issues, comparison.differences);
      
      const passed = issues.filter(issue => issue.includes('CRITICAL')).length === 0;

      return {
        testName,
        input,
        v1Output: comparison.v1,
        v2Output: comparison.v2,
        differences: comparison.differences,
        passed,
        issues,
        recommendations
      };

    } catch (error) {
      console.error(`[EmailV2Tester] Test ${testName} failed:`, error);
      
      return {
        testName,
        input,
        v1Output: 'ERROR',
        v2Output: 'ERROR',
        differences: [`ERROR: ${error}`],
        passed: false,
        issues: [`CRITICAL: Test execution failed - ${error}`],
        recommendations: ['Fix V2 system errors before proceeding']
      };
    }
  }

  /**
   * Detect specific issues in the formatting comparison
   */
  private detectIssues(input: string, v1Output: string, v2Output: string): string[] {
    const issues: string[] = [];

    // Check for line break preservation
    if (input.includes('\n\n') && !v2Output.includes('</p><p')) {
      issues.push('WARNING: Line breaks may not be properly preserved');
    }

    // Check for currency formatting protection
    if (input.includes('£') && !v2Output.includes('color:#000000')) {
      issues.push('WARNING: Currency amounts may not be protected from red formatting');
    }

    // Check for width constraints
    if (!v2Output.includes('max-width') && input.length > 200) {
      issues.push('WARNING: No width constraints applied for long content');
    }

    // Check for mobile responsiveness
    if (!v2Output.includes('overflow-wrap:break-word')) {
      issues.push('INFO: Mobile responsiveness could be improved');
    }

    // Check for significant length differences
    const lengthDiff = Math.abs(v1Output.length - v2Output.length);
    const lengthChangePercent = (lengthDiff / v1Output.length) * 100;
    
    if (lengthChangePercent > 50) {
      issues.push(`WARNING: Significant size difference (${lengthChangePercent.toFixed(1)}%)`);
    }

    // Check for potential errors
    if (v2Output.includes('undefined') || v2Output.includes('null')) {
      issues.push('CRITICAL: V2 output contains undefined/null values');
    }

    return issues;
  }

  /**
   * Generate recommendations based on detected issues
   */
  private generateRecommendations(issues: string[], differences: string[]): string[] {
    const recommendations: string[] = [];

    const criticalIssues = issues.filter(issue => issue.includes('CRITICAL'));
    const warnings = issues.filter(issue => issue.includes('WARNING'));

    if (criticalIssues.length > 0) {
      recommendations.push('❌ DO NOT use V2 in production - fix critical issues first');
    } else if (warnings.length > 2) {
      recommendations.push('⚠️ Use V2 with caution - monitor closely in testing');
    } else if (warnings.length > 0) {
      recommendations.push('✅ V2 appears safe but monitor the noted warnings');
    } else {
      recommendations.push('✅ V2 looks good for production use');
    }

    if (differences.length === 0) {
      recommendations.push('✅ Identical output - V2 safe for migration');
    } else if (differences.length < 3) {
      recommendations.push('✅ Minor differences - review before migration');
    } else {
      recommendations.push('⚠️ Significant differences - detailed review required');
    }

    return recommendations;
  }

  /**
   * Generate test suite summary
   */
  private generateSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.length - passed;
    
    const allIssues = this.results.flatMap(r => r.issues);
    const criticalIssues = allIssues.filter(issue => issue.includes('CRITICAL'));
    
    let overallRecommendation: string;
    
    if (criticalIssues.length > 0) {
      overallRecommendation = '❌ V2 system has critical issues - not ready for production';
    } else if (failed > this.results.length * 0.3) {
      overallRecommendation = '⚠️ Multiple test failures - extensive review needed';
    } else if (failed > 0) {
      overallRecommendation = '⚠️ Some tests failed - review and fix before production';
    } else {
      overallRecommendation = '✅ All tests passed - V2 appears ready for careful production testing';
    }

    return {
      totalTests: this.results.length,
      passed,
      failed,
      issues: allIssues,
      overallRecommendation
    };
  }

  /**
   * Generate detailed HTML report
   */
  generateHtmlReport(testSuite: TestSuite): string {
    const timestamp = new Date().toISOString();
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email V2 Testing Report</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .test-result { border: 1px solid #ddd; margin-bottom: 15px; border-radius: 8px; }
        .test-header { padding: 15px; background: #f5f5f5; border-bottom: 1px solid #ddd; }
        .test-content { padding: 15px; }
        .passed { border-left: 4px solid #4caf50; }
        .failed { border-left: 4px solid #f44336; }
        .code-block { background: #f8f8f8; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; overflow-x: auto; }
        .issue { padding: 5px 10px; margin: 5px 0; border-radius: 4px; }
        .critical { background: #ffebee; color: #c62828; }
        .warning { background: #fff3e0; color: #ef6c00; }
        .info { background: #e3f2fd; color: #1976d2; }
        .recommendation { background: #f1f8e9; padding: 10px; border-radius: 4px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📧 Email V2 Testing Report</h1>
        <p><strong>Generated:</strong> ${timestamp}</p>
        <p><strong>System Status:</strong> ${EmailProcessor.getStatus().currentSystem}</p>
    </div>

    <div class="summary">
        <h2>📊 Test Summary</h2>
        <p><strong>Total Tests:</strong> ${testSuite.summary.totalTests}</p>
        <p><strong>Passed:</strong> ${testSuite.summary.passed}</p>
        <p><strong>Failed:</strong> ${testSuite.summary.failed}</p>
        <p><strong>Overall Recommendation:</strong> ${testSuite.summary.overallRecommendation}</p>
    </div>

    ${testSuite.results.map(result => `
        <div class="test-result ${result.passed ? 'passed' : 'failed'}">
            <div class="test-header">
                <h3>${result.testName} ${result.passed ? '✅' : '❌'}</h3>
            </div>
            <div class="test-content">
                <h4>Input:</h4>
                <div class="code-block">${this.escapeHtml(result.input)}</div>
                
                <h4>V1 Output:</h4>
                <div class="code-block">${this.escapeHtml(result.v1Output)}</div>
                
                <h4>V2 Output:</h4>
                <div class="code-block">${this.escapeHtml(result.v2Output)}</div>
                
                ${result.differences.length > 0 ? `
                    <h4>Differences:</h4>
                    <ul>
                        ${result.differences.map(diff => `<li>${this.escapeHtml(diff)}</li>`).join('')}
                    </ul>
                ` : '<p><em>No differences detected</em></p>'}
                
                ${result.issues.length > 0 ? `
                    <h4>Issues:</h4>
                    ${result.issues.map(issue => `
                        <div class="issue ${issue.includes('CRITICAL') ? 'critical' : issue.includes('WARNING') ? 'warning' : 'info'}">
                            ${this.escapeHtml(issue)}
                        </div>
                    `).join('')}
                ` : ''}
                
                ${result.recommendations.length > 0 ? `
                    <h4>Recommendations:</h4>
                    ${result.recommendations.map(rec => `
                        <div class="recommendation">${this.escapeHtml(rec)}</div>
                    `).join('')}
                ` : ''}
            </div>
        </div>
    `).join('')}

    <div class="summary">
        <h2>🎯 Next Steps</h2>
        <ul>
            <li>Review any critical issues before enabling V2</li>
            <li>Test with real email clients (Outlook, Gmail, etc.)</li>
            <li>Monitor production metrics if V2 is enabled</li>
            <li>Keep V1 fallback enabled during initial rollout</li>
        </ul>
    </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Quick production safety check
   */
  static async quickSafetyCheck(): Promise<{ safe: boolean; issues: string[] }> {
    const tester = new EmailV2Tester();
    
    // Run a subset of critical tests
    const criticalTests = [
      { name: 'Basic Text', input: 'Hello world\n\nThis is a test.' },
      { name: 'Currency', input: 'Cost: £1,500 + VAT' },
      { name: 'Rich Text', input: '<p><strong>Bold</strong> and <em>italic</em> text</p>' }
    ];

    const issues: string[] = [];
    let allPassed = true;

    for (const test of criticalTests) {
      try {
        const result = await tester.runSingleTest(test.name, test.input);
        if (!result.passed) {
          allPassed = false;
          issues.push(`${test.name}: ${result.issues.join(', ')}`);
        }
      } catch (error) {
        allPassed = false;
        issues.push(`${test.name}: Critical error - ${error}`);
      }
    }

    return {
      safe: allPassed && issues.length === 0,
      issues
    };
  }
}

export default EmailV2Tester;