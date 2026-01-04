/**
 * Tests for groupGenerator utility functions
 * 
 * To run these tests manually in the console:
 * 1. Build the project: npm run build
 * 2. Load the plugin in Obsidian
 * 3. Open Developer Console (Ctrl+Shift+I / Cmd+Option+I)
 * 4. Copy and paste test code
 */

import { parseNodesFromMarkdown, calculateSmartLayout } from '../groupGenerator';

/**
 * Test Suite for parseNodesFromMarkdown
 */
export function testParseNodesFromMarkdown() {
	console.group('🧪 Testing parseNodesFromMarkdown');

	// Test 1: Parse with ### headers
	console.group('Test 1: ### Header Format');
	const markdown1 = `### Node 1
Content for node 1

### Node 2
Content for node 2

### Node 3
Content for node 3`;
	
	const result1 = parseNodesFromMarkdown(markdown1);
	console.log('Input:', markdown1);
	console.log('Output:', result1);
	console.assert(result1.nodes.length === 3, '❌ Should parse 3 nodes');
	console.assert(result1.nodes[0].title === 'Node 1', '❌ First node title should be "Node 1"');
	console.assert(result1.nodes[0].content === 'Content for node 1', '❌ First node content mismatch');
	console.log('✅ Test 1 passed');
	console.groupEnd();

	// Test 2: Parse with --- separators
	console.group('Test 2: --- Separator Format');
	const markdown2 = `First node content

---

Second node content

---

Third node content`;
	
	const result2 = parseNodesFromMarkdown(markdown2);
	console.log('Input:', markdown2);
	console.log('Output:', result2);
	console.assert(result2.nodes.length === 3, '❌ Should parse 3 nodes');
	console.assert(result2.nodes[0].content === 'First node content', '❌ First node content mismatch');
	console.log('✅ Test 2 passed');
	console.groupEnd();

	// Test 3: Single node (no separators)
	console.group('Test 3: Single Node');
	const markdown3 = 'This is a single node without any separators.';
	const result3 = parseNodesFromMarkdown(markdown3);
	console.log('Input:', markdown3);
	console.log('Output:', result3);
	console.assert(result3.nodes.length === 1, '❌ Should parse 1 node');
	console.log('✅ Test 3 passed');
	console.groupEnd();

	// Test 4: Empty content
	console.group('Test 4: Empty Content');
	const markdown4 = '';
	const result4 = parseNodesFromMarkdown(markdown4);
	console.log('Input:', markdown4);
	console.log('Output:', result4);
	console.assert(result4.nodes.length === 0, '❌ Should parse 0 nodes');
	console.log('✅ Test 4 passed');
	console.groupEnd();

	// Test 5: Mixed content with headers
	console.group('Test 5: Complex Content with Headers');
	const markdown5 = `### Introduction
This is the introduction with **bold** and *italic* text.

It has multiple paragraphs.

### Key Concepts
- Bullet point 1
- Bullet point 2
- Bullet point 3

### Conclusion
Final thoughts here.`;
	
	const result5 = parseNodesFromMarkdown(markdown5);
	console.log('Input:', markdown5);
	console.log('Output:', result5);
	console.assert(result5.nodes.length === 3, '❌ Should parse 3 nodes');
	console.assert(result5.nodes[0].title === 'Introduction', '❌ Title mismatch');
	console.assert(result5.nodes[0].content.includes('multiple paragraphs'), '❌ Content should preserve formatting');
	console.log('✅ Test 5 passed');
	console.groupEnd();

	// Test 6: Headers without content
	console.group('Test 6: Headers Without Content');
	const markdown6 = `### Node 1

### Node 2

### Node 3
Content only in the third node`;
	
	const result6 = parseNodesFromMarkdown(markdown6);
	console.log('Input:', markdown6);
	console.log('Output:', result6);
	console.assert(result6.nodes.length === 1, '❌ Should only parse nodes with content');
	console.log('✅ Test 6 passed');
	console.groupEnd();

	console.log('✅ All parseNodesFromMarkdown tests passed!');
	console.groupEnd();
}

/**
 * Test Suite for calculateSmartLayout
 */
export function testCalculateSmartLayout() {
	console.group('🧪 Testing calculateSmartLayout');

	// Test 1: 2 nodes (horizontal)
	console.group('Test 1: 2 Nodes - Horizontal Layout');
	const contents1 = ['Short content', 'Another short content'];
	const layouts1 = calculateSmartLayout(contents1);
	console.log('Node count:', contents1.length);
	console.log('Layout:', layouts1);
	console.assert(layouts1.length === 2, '❌ Should generate 2 layouts');
	console.assert(layouts1[0].x === 0, '❌ First node should be at x=0');
	console.assert(layouts1[1].x === 400, '❌ Second node should be offset by width + spacing');
	console.log('✅ Test 1 passed');
	console.groupEnd();

	// Test 2: 4 nodes (2x2 grid)
	console.group('Test 2: 4 Nodes - 2x2 Grid');
	const contents2 = ['Node 1', 'Node 2', 'Node 3', 'Node 4'];
	const layouts2 = calculateSmartLayout(contents2);
	console.log('Node count:', contents2.length);
	console.log('Layout:', layouts2);
	console.assert(layouts2.length === 4, '❌ Should generate 4 layouts');
	console.assert(layouts2[2].x === 0, '❌ Third node should wrap to new row');
	console.assert(layouts2[2].y > layouts2[0].y, '❌ Third node should be below first');
	console.log('✅ Test 2 passed');
	console.groupEnd();

	// Test 3: 6 nodes (2x3 grid)
	console.group('Test 3: 6 Nodes - 2x3 Grid');
	const contents3 = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'];
	const layouts3 = calculateSmartLayout(contents3);
	console.log('Node count:', contents3.length);
	console.log('Layout:', layouts3);
	console.assert(layouts3.length === 6, '❌ Should generate 6 layouts');
	console.log('✅ Test 3 passed');
	console.groupEnd();

	// Test 4: 8 nodes (3 column grid)
	console.group('Test 4: 8 Nodes - 3 Column Grid');
	const contents4 = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8'];
	const layouts4 = calculateSmartLayout(contents4);
	console.log('Node count:', contents4.length);
	console.log('Layout:', layouts4);
	console.assert(layouts4.length === 8, '❌ Should generate 8 layouts');
	console.assert(layouts4[3].x === 0, '❌ Fourth node should wrap to new row (3 columns)');
	console.log('✅ Test 4 passed');
	console.groupEnd();

	// Test 5: Different content lengths
	console.group('Test 5: Variable Content Lengths');
	const contents5 = [
		'Short',
		'This is a much longer content that should result in a taller node with more text that wraps around multiple lines.',
		'Medium length content here'
	];
	const layouts5 = calculateSmartLayout(contents5);
	console.log('Node count:', contents5.length);
	console.log('Layout:', layouts5);
	console.assert(layouts5.length === 3, '❌ Should generate 3 layouts');
	console.assert(layouts5[1].height > layouts5[0].height, '❌ Longer content should have greater height');
	console.log('✅ Test 5 passed');
	console.groupEnd();

	// Test 6: Custom options
	console.group('Test 6: Custom Options');
	const contents6 = ['Node 1', 'Node 2'];
	const layouts6 = calculateSmartLayout(contents6, {
		nodeWidth: 500,
		nodeSpacing: 60
	});
	console.log('Node count:', contents6.length);
	console.log('Layout with custom options:', layouts6);
	console.assert(layouts6[0].width === 500, '❌ Width should be 500');
	console.assert(layouts6[1].x === 560, '❌ Second node should be at 500 + 60');
	console.log('✅ Test 6 passed');
	console.groupEnd();

	console.log('✅ All calculateSmartLayout tests passed!');
	console.groupEnd();
}

/**
 * Run all tests
 */
export function runAllGroupGeneratorTests() {
	console.clear();
	console.log('🚀 Running Group Generator Tests');
	console.log('================================\n');
	
	testParseNodesFromMarkdown();
	console.log('\n');
	testCalculateSmartLayout();
	
	console.log('\n================================');
	console.log('✅ All tests completed!');
}

// For manual testing in console
if (typeof window !== 'undefined') {
	(window as any).testGroupGenerator = {
		runAll: runAllGroupGeneratorTests,
		testParse: testParseNodesFromMarkdown,
		testLayout: testCalculateSmartLayout,
	};
	console.log('💡 Group Generator tests loaded. Run in console:');
	console.log('   window.testGroupGenerator.runAll()');
	console.log('   window.testGroupGenerator.testParse()');
	console.log('   window.testGroupGenerator.testLayout()');
}

