const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../icon/Untitled.icon/Assets/chat-dots-svgrepo-com.svg');
const outputDir = path.join(__dirname, '../ios/OwuiNative/Images.xcassets/AppIcon.appiconset');

// iOS icon sizes (logical size @ scale = actual pixel size)
const iconSizes = [
  { size: '20x20', scale: '2x', pixels: 40, filename: 'icon-20@2x.png' },
  { size: '20x20', scale: '3x', pixels: 60, filename: 'icon-20@3x.png' },
  { size: '29x29', scale: '2x', pixels: 58, filename: 'icon-29@2x.png' },
  { size: '29x29', scale: '3x', pixels: 87, filename: 'icon-29@3x.png' },
  { size: '40x40', scale: '2x', pixels: 80, filename: 'icon-40@2x.png' },
  { size: '40x40', scale: '3x', pixels: 120, filename: 'icon-40@3x.png' },
  { size: '60x60', scale: '2x', pixels: 120, filename: 'icon-60@2x.png' },
  { size: '60x60', scale: '3x', pixels: 180, filename: 'icon-60@3x.png' },
  { size: '1024x1024', scale: '1x', pixels: 1024, filename: 'icon-1024@1x.png' },
];

async function generateIcons() {
  console.log('Generating iOS app icons from SVG...');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate all icon sizes
  for (const icon of iconSizes) {
    const outputPath = path.join(outputDir, icon.filename);
    console.log(`Generating ${icon.filename} (${icon.pixels}x${icon.pixels}px)...`);
    
    // Resize SVG to 70% of icon size to make it smaller
    const svgSize = Math.floor(icon.pixels * 0.7);
    
    const svgBuffer = await sharp(svgPath)
      .resize(svgSize, svgSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background for SVG
      })
      .png()
      .toBuffer();
    
    // Create white background and composite the smaller SVG on top
    await sharp({
      create: {
        width: icon.pixels,
        height: icon.pixels,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
      }
    })
      .composite([{
        input: svgBuffer,
        top: Math.floor((icon.pixels - svgSize) / 2),
        left: Math.floor((icon.pixels - svgSize) / 2)
      }])
      .png()
      .toFile(outputPath);
  }

  // Update Contents.json
  const contentsJson = {
    images: iconSizes.map(icon => ({
      idiom: icon.size === '1024x1024' ? 'ios-marketing' : 'iphone',
      scale: icon.scale,
      size: icon.size,
      filename: icon.filename,
    })),
    info: {
      author: 'xcode',
      version: 1,
    },
  };

  const contentsPath = path.join(outputDir, 'Contents.json');
  fs.writeFileSync(contentsPath, JSON.stringify(contentsJson, null, 2));
  
  console.log('✓ Icons generated successfully!');
  console.log(`✓ Updated ${contentsPath}`);
}

generateIcons().catch(console.error);
