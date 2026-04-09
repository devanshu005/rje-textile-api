require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const db = require('../database');
const { Admin, Textile, Supplier, Stock, ScanHistory, KnowledgeBase } = require('./schemas');

async function seed() {
console.log('🌱 Seeding database...\n');

await db.connect();

// Clear all collections
await Promise.all([
  Admin.deleteMany({}), Textile.deleteMany({}), Supplier.deleteMany({}),
  Stock.deleteMany({}), ScanHistory.deleteMany({}), KnowledgeBase.deleteMany({})
]);
console.log('🗑️  Cleared all collections');

// Create default admin
const adminPassword = bcrypt.hashSync(process.env.ADMIN_DEFAULT_PASSWORD || 'admin123', 10);
await db.insert('admins', {
  username: 'admin', password: adminPassword,
  full_name: 'System Administrator', is_active: 1
});
console.log('✅ Admin user created (username: admin, password: admin123)');

// Seed Suppliers
const suppliers = [
  { name: 'Arvind Mills', contact_person: 'Rajesh Patel', email: 'rajesh@arvindmills.com', phone: '+91-79-2630-1234', address: '2nd Floor, Naroda Industrial Estate', city: 'Ahmedabad', state: 'Gujarat', rating: 4.8 },
  { name: 'Raymond Textiles', contact_person: 'Sunil Sharma', email: 'sunil@raymond.com', phone: '+91-22-2764-5678', address: 'Plot 156, MIDC', city: 'Mumbai', state: 'Maharashtra', rating: 4.9 },
  { name: 'Welspun India', contact_person: 'Priya Desai', email: 'priya@welspun.com', phone: '+91-22-6613-6000', address: 'Welspun House, Kamala Mills', city: 'Mumbai', state: 'Maharashtra', rating: 4.5 },
  { name: 'Vardhman Textiles', contact_person: 'Amit Kumar', email: 'amit@vardhman.com', phone: '+91-161-266-4466', address: 'Industrial Area Phase-1', city: 'Ludhiana', state: 'Punjab', rating: 4.3 },
  { name: 'Bombay Dyeing', contact_person: 'Nisha Mehta', email: 'nisha@bombaydyeing.com', phone: '+91-22-2493-5000', address: 'Neville House, Ballard Estate', city: 'Mumbai', state: 'Maharashtra', rating: 4.6 },
  { name: 'Alok Industries', contact_person: 'Vikram Jain', email: 'vikram@alokind.com', phone: '+91-22-6161-3000', address: 'Peninsula Business Park', city: 'Mumbai', state: 'Maharashtra', rating: 4.1 },
  { name: 'Surat Silk Mills', contact_person: 'Harshad Shah', email: 'harshad@suratsilk.com', phone: '+91-261-234-5678', address: 'Ring Road, Textile Market', city: 'Surat', state: 'Gujarat', rating: 4.4 },
  { name: 'Erode Cotton Traders', contact_person: 'Murugan S', email: 'murugan@erodecotton.com', phone: '+91-424-222-3344', address: 'Texvalley Complex', city: 'Erode', state: 'Tamil Nadu', rating: 4.2 },
  { name: 'Bhilwara Textiles', contact_person: 'Dinesh Agarwal', email: 'dinesh@bhilwaratex.com', phone: '+91-1482-234-567', address: 'RIICO Industrial Area', city: 'Bhilwara', state: 'Rajasthan', rating: 4.0 },
  { name: 'Kanpur Woolen Mills', contact_person: 'Ravi Gupta', email: 'ravi@kanpurwoolen.com', phone: '+91-512-234-5678', address: 'Panki Industrial Area', city: 'Kanpur', state: 'Uttar Pradesh', rating: 3.9 }
];

const insertSupplier = async (s) => await db.insert('suppliers', { ...s, is_active: 1, country: 'India' });

const supplierDocs = [];
for (const s of suppliers) {
  supplierDocs.push(await insertSupplier(s));
}
console.log(`✅ ${suppliers.length} suppliers created`);

// Seed Textiles
const textiles = [
  { name: 'Royal Blue Silk Saree Fabric', description: 'Premium Banarasi silk with intricate gold zari work. Perfect for wedding and festive occasions.', primary_color: 'Blue', secondary_colors: 'Gold,White', pattern: 'Paisley', material: 'Silk', weave_type: 'Jacquard', weight_gsm: 180, width_inches: 45, price_per_meter: 2500, tags: 'wedding,festive,premium,banarasi,zari', sku: 'TXT-BLU-SLK-001' },
  { name: 'Red Bandhani Cotton', description: 'Traditional Rajasthani bandhani tie-dye on pure cotton. Vibrant red with white dot patterns.', primary_color: 'Red', secondary_colors: 'White', pattern: 'Bandhani', material: 'Cotton', weave_type: 'Plain', weight_gsm: 120, width_inches: 44, price_per_meter: 450, tags: 'traditional,rajasthani,casual,bandhani', sku: 'TXT-RED-COT-001' },
  { name: 'Green Chanderi Brocade', description: 'Light and airy Chanderi fabric with shimmering gold brocade motifs on emerald green base.', primary_color: 'Green', secondary_colors: 'Gold', pattern: 'Brocade', material: 'Chanderi', weave_type: 'Dobby', weight_gsm: 90, width_inches: 44, price_per_meter: 1200, tags: 'elegant,lightweight,festive,brocade', sku: 'TXT-GRN-CHN-001' },
  { name: 'White Chikankari Georgette', description: 'Lucknowi chikankari hand embroidery on flowy georgette. Delicate floral patterns.', primary_color: 'White', secondary_colors: 'Cream', pattern: 'Chikankari', material: 'Georgette', weave_type: 'Plain', weight_gsm: 60, width_inches: 44, price_per_meter: 1800, tags: 'lucknowi,handwork,elegant,summer', sku: 'TXT-WHT-GEO-001' },
  { name: 'Black Velvet with Embroidery', description: 'Rich black velvet fabric with golden thread embroidery. Ideal for sherwani and lehenga.', primary_color: 'Black', secondary_colors: 'Gold', pattern: 'Embroidered', material: 'Velvet', weave_type: 'Pile', weight_gsm: 350, width_inches: 58, price_per_meter: 3200, tags: 'luxury,wedding,sherwani,lehenga,winter', sku: 'TXT-BLK-VLV-001' },
  { name: 'Pink Ikat Print Linen', description: 'Contemporary ikat geometric prints on premium linen. Perfect for summer kurtas.', primary_color: 'Pink', secondary_colors: 'White,Grey', pattern: 'Ikat', material: 'Linen', weave_type: 'Plain', weight_gsm: 150, width_inches: 58, price_per_meter: 900, tags: 'summer,casual,contemporary,ikat', sku: 'TXT-PNK-LIN-001' },
  { name: 'Yellow Kanjivaram Silk', description: 'Classic Kanjivaram silk from Tamil Nadu with temple border design. Rich yellow gold.', primary_color: 'Yellow', secondary_colors: 'Red,Gold', pattern: 'Temple Border', material: 'Silk', weave_type: 'Jacquard', weight_gsm: 200, width_inches: 45, price_per_meter: 4500, tags: 'kanjivaram,wedding,south-indian,premium', sku: 'TXT-YLW-SLK-001' },
  { name: 'Orange Khadi Block Print', description: 'Handspun khadi cotton with traditional block print in warm orange tones.', primary_color: 'Orange', secondary_colors: 'Brown,White', pattern: 'Block Print', material: 'Khadi', weave_type: 'Handloom', weight_gsm: 140, width_inches: 42, price_per_meter: 600, tags: 'handloom,block-print,sustainable,traditional', sku: 'TXT-ORG-KHD-001' },
  { name: 'Navy Blue Denim', description: 'Premium 12oz raw selvedge denim. Japanese shuttle loom construction.', primary_color: 'Navy', secondary_colors: 'White', pattern: 'Twill', material: 'Denim', weave_type: 'Twill', weight_gsm: 400, width_inches: 32, price_per_meter: 750, tags: 'denim,jeans,casual,raw,selvedge', sku: 'TXT-NVY-DNM-001' },
  { name: 'Beige Tussar Silk', description: 'Natural tussar silk with a raw, organic texture. Beautiful drape for sarees and dupattas.', primary_color: 'Beige', secondary_colors: 'Gold', pattern: 'Plain', material: 'Tussar Silk', weave_type: 'Plain', weight_gsm: 100, width_inches: 45, price_per_meter: 1500, tags: 'natural,organic,tussar,handloom', sku: 'TXT-BGE-TSR-001' },
  { name: 'Maroon Pashmina Shawl', description: 'Authentic Kashmiri pashmina with hand-embroidered paisley motifs. Ultra soft and warm.', primary_color: 'Maroon', secondary_colors: 'Gold,Green', pattern: 'Paisley', material: 'Pashmina', weave_type: 'Twill', weight_gsm: 80, width_inches: 40, price_per_meter: 8000, tags: 'kashmiri,shawl,luxury,winter,pashmina', sku: 'TXT-MRN-PSH-001' },
  { name: 'Purple Organza with Sequins', description: 'Sheer organza fabric in royal purple with delicate sequin embellishments.', primary_color: 'Purple', secondary_colors: 'Silver', pattern: 'Sequin Work', material: 'Organza', weave_type: 'Plain', weight_gsm: 45, width_inches: 44, price_per_meter: 1100, tags: 'party,festive,sheer,sequin,lehenga', sku: 'TXT-PRP-ORG-001' },
  { name: 'Coral Crepe de Chine', description: 'Smooth crepe de chine in coral shade. Excellent drape for gowns and western wear.', primary_color: 'Coral', secondary_colors: null, pattern: 'Plain', material: 'Crepe', weave_type: 'Satin', weight_gsm: 75, width_inches: 44, price_per_meter: 850, tags: 'gown,western,elegant,crepe', sku: 'TXT-CRL-CRP-001' },
  { name: 'Teal Ajrakh Block Print', description: 'Ancient Sindhi Ajrakh block printing technique on cotton. Intricate geometric patterns.', primary_color: 'Teal', secondary_colors: 'Red,Black', pattern: 'Ajrakh', material: 'Cotton', weave_type: 'Plain', weight_gsm: 130, width_inches: 44, price_per_meter: 550, tags: 'ajrakh,traditional,block-print,sindhi', sku: 'TXT-TEL-COT-001' },
  { name: 'Grey Wool Tweed', description: 'British-style tweed in heathered grey. Perfect for blazers and winter jackets.', primary_color: 'Grey', secondary_colors: 'Black,White', pattern: 'Tweed', material: 'Wool', weave_type: 'Twill', weight_gsm: 380, width_inches: 58, price_per_meter: 2200, tags: 'blazer,winter,formal,tweed,wool', sku: 'TXT-GRY-WOL-001' },
  { name: 'Ivory Chiffon with Lace', description: 'Ethereal ivory chiffon with French lace border. Bridal and occasion wear.', primary_color: 'White', secondary_colors: 'Ivory,Cream', pattern: 'Lace Border', material: 'Chiffon', weave_type: 'Plain', weight_gsm: 40, width_inches: 44, price_per_meter: 1400, tags: 'bridal,wedding,sheer,lace,chiffon', sku: 'TXT-IVR-CHF-001' },
  { name: 'Mustard Kalamkari Print', description: 'Traditional Kalamkari hand-painted fabric in mustard. Mythological motifs from Andhra Pradesh.', primary_color: 'Yellow', secondary_colors: 'Brown,Red,Black', pattern: 'Kalamkari', material: 'Cotton', weave_type: 'Plain', weight_gsm: 135, width_inches: 44, price_per_meter: 700, tags: 'kalamkari,traditional,hand-painted,andhra', sku: 'TXT-MST-COT-001' },
  { name: 'Brown Jute Fabric', description: 'Natural jute fabric for eco-friendly bags and home décor. Rustic and sturdy.', primary_color: 'Brown', secondary_colors: 'Beige', pattern: 'Plain', material: 'Jute', weave_type: 'Plain', weight_gsm: 300, width_inches: 48, price_per_meter: 200, tags: 'eco-friendly,bags,home-decor,jute,sustainable', sku: 'TXT-BRN-JUT-001' },
  { name: 'Indigo Shibori Cotton', description: 'Japanese-inspired shibori dyed cotton in deep indigo. Unique tied patterns.', primary_color: 'Blue', secondary_colors: 'White', pattern: 'Shibori', material: 'Cotton', weave_type: 'Plain', weight_gsm: 125, width_inches: 44, price_per_meter: 480, tags: 'shibori,indigo,japanese,dyed,cotton', sku: 'TXT-IND-COT-001' },
  { name: 'Rose Gold Tissue Fabric', description: 'Metallic tissue fabric in rose gold. Stunning for dupatta and accent pieces.', primary_color: 'Pink', secondary_colors: 'Gold', pattern: 'Metallic', material: 'Tissue', weave_type: 'Plain', weight_gsm: 55, width_inches: 44, price_per_meter: 950, tags: 'metallic,party,dupatta,festive,tissue', sku: 'TXT-RSG-TIS-001' },
  { name: 'Forest Green Raw Silk', description: 'Rich forest green raw silk with natural slubs. Great for kurtas and ethnic wear.', primary_color: 'Green', secondary_colors: null, pattern: 'Plain', material: 'Raw Silk', weave_type: 'Plain', weight_gsm: 160, width_inches: 44, price_per_meter: 1600, tags: 'raw-silk,ethnic,kurta,natural', sku: 'TXT-FGR-RSK-001' },
  { name: 'Crimson Banarasi Brocade', description: 'Heavy Banarasi brocade in regal crimson with intricate motifs woven in gold thread.', primary_color: 'Red', secondary_colors: 'Gold', pattern: 'Brocade', material: 'Silk', weave_type: 'Jacquard', weight_gsm: 250, width_inches: 45, price_per_meter: 5500, tags: 'banarasi,wedding,heavy,brocade,premium', sku: 'TXT-CRM-SLK-001' },
  { name: 'Sky Blue Chambray', description: 'Lightweight chambray fabric in sky blue. Perfect for casual shirts and dresses.', primary_color: 'Blue', secondary_colors: 'White', pattern: 'Plain', material: 'Cotton', weave_type: 'Plain', weight_gsm: 110, width_inches: 58, price_per_meter: 350, tags: 'casual,shirt,dress,chambray,summer', sku: 'TXT-SKY-CMB-001' },
  { name: 'Olive Green Canvas', description: 'Heavy-duty cotton canvas in olive green. For bags, upholstery, and outdoor use.', primary_color: 'Green', secondary_colors: null, pattern: 'Plain', material: 'Canvas', weave_type: 'Plain', weight_gsm: 450, width_inches: 58, price_per_meter: 400, tags: 'canvas,bags,upholstery,outdoor,heavy-duty', sku: 'TXT-OLV-CNV-001' },
  { name: 'Lavender Satin', description: 'Smooth satin fabric in gentle lavender shade. For evening gowns and lingerie.', primary_color: 'Purple', secondary_colors: 'Pink', pattern: 'Plain', material: 'Satin', weave_type: 'Satin', weight_gsm: 95, width_inches: 44, price_per_meter: 550, tags: 'satin,evening,gown,smooth,party', sku: 'TXT-LAV-SAT-001' }
];

const insertTextile = async (t) => await db.insert('textiles', t);

const textileDocs = [];
for (const t of textiles) {
  textileDocs.push(await insertTextile(t));
}
console.log(`✅ ${textiles.length} textiles created`);

// Seed Stock - map indices to MongoDB ObjectIds
const stockMappings = [
  { ti: 0, si: 6, quantity_meters: 150, min_order: 5, price: 2400, lead: 5 },
  { ti: 0, si: 1, quantity_meters: 80, min_order: 10, price: 2600, lead: 7 },
  { ti: 1, si: 0, quantity_meters: 500, min_order: 10, price: 420, lead: 3 },
  { ti: 1, si: 8, quantity_meters: 200, min_order: 20, price: 400, lead: 5 },
  { ti: 2, si: 0, quantity_meters: 120, min_order: 5, price: 1100, lead: 7 },
  { ti: 3, si: 9, quantity_meters: 60, min_order: 5, price: 1750, lead: 14 },
  { ti: 3, si: 3, quantity_meters: 30, min_order: 2, price: 1900, lead: 10 },
  { ti: 4, si: 1, quantity_meters: 45, min_order: 5, price: 3100, lead: 7 },
  { ti: 4, si: 4, quantity_meters: 70, min_order: 10, price: 3000, lead: 5 },
  { ti: 5, si: 7, quantity_meters: 300, min_order: 5, price: 850, lead: 3 },
  { ti: 6, si: 7, quantity_meters: 40, min_order: 2, price: 4200, lead: 14 },
  { ti: 6, si: 6, quantity_meters: 25, min_order: 1, price: 4600, lead: 10 },
  { ti: 7, si: 8, quantity_meters: 400, min_order: 20, price: 550, lead: 5 },
  { ti: 7, si: 0, quantity_meters: 200, min_order: 10, price: 580, lead: 3 },
  { ti: 8, si: 0, quantity_meters: 1000, min_order: 50, price: 700, lead: 3 },
  { ti: 8, si: 3, quantity_meters: 500, min_order: 25, price: 720, lead: 5 },
  { ti: 9, si: 6, quantity_meters: 90, min_order: 5, price: 1400, lead: 7 },
  { ti: 10, si: 9, quantity_meters: 15, min_order: 1, price: 7500, lead: 21 },
  { ti: 11, si: 6, quantity_meters: 200, min_order: 5, price: 1000, lead: 5 },
  { ti: 11, si: 4, quantity_meters: 130, min_order: 10, price: 1050, lead: 7 },
  { ti: 12, si: 2, quantity_meters: 250, min_order: 10, price: 800, lead: 5 },
  { ti: 13, si: 8, quantity_meters: 180, min_order: 10, price: 520, lead: 7 },
  { ti: 13, si: 0, quantity_meters: 100, min_order: 10, price: 540, lead: 5 },
  { ti: 14, si: 1, quantity_meters: 80, min_order: 5, price: 2100, lead: 10 },
  { ti: 15, si: 4, quantity_meters: 150, min_order: 5, price: 1350, lead: 5 },
  { ti: 15, si: 2, quantity_meters: 50, min_order: 5, price: 1400, lead: 7 },
  { ti: 16, si: 7, quantity_meters: 350, min_order: 10, price: 650, lead: 5 },
  { ti: 17, si: 3, quantity_meters: 800, min_order: 50, price: 180, lead: 3 },
  { ti: 17, si: 5, quantity_meters: 600, min_order: 25, price: 190, lead: 3 },
  { ti: 18, si: 8, quantity_meters: 250, min_order: 10, price: 460, lead: 5 },
  { ti: 18, si: 0, quantity_meters: 150, min_order: 10, price: 470, lead: 3 },
  { ti: 19, si: 6, quantity_meters: 100, min_order: 5, price: 900, lead: 5 },
  { ti: 20, si: 6, quantity_meters: 80, min_order: 5, price: 1500, lead: 7 },
  { ti: 20, si: 1, quantity_meters: 50, min_order: 5, price: 1550, lead: 10 },
  { ti: 21, si: 6, quantity_meters: 30, min_order: 2, price: 5200, lead: 14 },
  { ti: 22, si: 0, quantity_meters: 600, min_order: 25, price: 320, lead: 3 },
  { ti: 22, si: 3, quantity_meters: 400, min_order: 20, price: 340, lead: 3 },
  { ti: 23, si: 3, quantity_meters: 500, min_order: 25, price: 380, lead: 3 },
  { ti: 24, si: 4, quantity_meters: 200, min_order: 10, price: 520, lead: 5 },
  { ti: 24, si: 2, quantity_meters: 120, min_order: 5, price: 540, lead: 5 },
];

for (const s of stockMappings) {
  await db.insert('stock', {
    textile_id: textileDocs[s.ti]._id,
    supplier_id: supplierDocs[s.si]._id,
    quantity_meters: s.quantity_meters, min_order_meters: s.min_order,
    price_per_meter: s.price, lead_time_days: s.lead,
    is_available: 1,
  });
}
console.log(`✅ ${stockMappings.length} stock entries created`);

// Seed Knowledge Base — 10 Indian Textile Types
const knowledgeBase = [
  {
    textile_type: 'Tussar Silk', origin: 'Jharkhand, Bihar, West Bengal',
    description: 'Wild silk produced from Antheraea mylitta silkworms. Known for its rich texture, natural gold colour, and slightly coarse feel. Often used for sarees and dupattas.',
    typical_colors: ['gold', 'beige', 'honey', 'cream', 'brown'],
    typical_patterns: ['Plain', 'Subtle', 'Block Print', 'Embroidered'],
    material_category: 'Silk',
    identifying_features: 'Natural golden-beige hue, slightly coarse texture with visible slubs, matte sheen unlike mulberry silk, lightweight drape',
    texture_keywords: ['coarse', 'textured', 'matte', 'slubby', 'natural']
  },
  {
    textile_type: 'Dupion Silk', origin: 'Karnataka, Tamil Nadu',
    description: 'Crisp silk fabric with a distinctive slubbed texture created from double cocoons. Has a slightly rough feel with natural irregularities.',
    typical_colors: ['gold', 'red', 'blue', 'green', 'purple', 'pink', 'maroon', 'cream'],
    typical_patterns: ['Plain', 'Stripes', 'Checks'],
    material_category: 'Silk',
    identifying_features: 'Crisp hand feel, irregular slubs throughout, subtle sheen, lightweight yet structured, visible yarn irregularities',
    texture_keywords: ['crisp', 'slubby', 'structured', 'lustrous', 'irregular']
  },
  {
    textile_type: 'Jacquard / Brocade', origin: 'Varanasi, Uttar Pradesh',
    description: 'Richly decorative fabric woven on a Jacquard loom. Banarasi brocade features intricate patterns with gold/silver zari threads.',
    typical_colors: ['red', 'maroon', 'gold', 'green', 'purple', 'navy', 'wine', 'pink'],
    typical_patterns: ['Brocade', 'Paisley', 'Floral', 'Geometric', 'Temple Border'],
    material_category: 'Silk',
    identifying_features: 'Raised woven patterns, metallic zari threads (gold/silver), heavy weight, rich luxurious feel, reversible design often visible',
    texture_keywords: ['heavy', 'raised', 'metallic', 'luxurious', 'ornate']
  },
  {
    textile_type: 'Pashmina', origin: 'Kashmir, Jammu & Kashmir',
    description: 'Ultra-fine cashmere wool from Changthangi goats. Known for incredible softness, warmth, and lightweight drape. Often hand-embroidered.',
    typical_colors: ['cream', 'beige', 'maroon', 'navy', 'black', 'ivory', 'pastel'],
    typical_patterns: ['Paisley', 'Embroidered', 'Plain', 'Floral'],
    material_category: 'Wool',
    identifying_features: 'Extremely soft and lightweight, warm despite thinness, can pass through a ring (ring test), fine weave, often with Kashmiri sozni embroidery',
    texture_keywords: ['ultra-soft', 'fine', 'warm', 'lightweight', 'cashmere']
  },
  {
    textile_type: 'Cotton / Khadi', origin: 'Gujarat, Uttar Pradesh, Tamil Nadu',
    description: 'Hand-spun and hand-woven cotton fabric. Symbol of Indian independence movement. Breathable, absorbent, and eco-friendly.',
    typical_colors: ['white', 'cream', 'beige', 'indigo', 'brown', 'mustard', 'orange'],
    typical_patterns: ['Plain', 'Stripes', 'Checks', 'Block Print'],
    material_category: 'Cotton',
    identifying_features: 'Slightly rough hand feel, visible handloom irregularities, breathable and absorbent, gets softer with washing, earthy natural look',
    texture_keywords: ['breathable', 'absorbent', 'handspun', 'rough', 'natural', 'organic']
  },
  {
    textile_type: 'Kalamkari', origin: 'Andhra Pradesh, Telangana',
    description: 'Ancient art of hand-painting or block-printing on cotton using natural dyes. Features mythological and floral motifs.',
    typical_colors: ['mustard', 'red', 'black', 'brown', 'teal', 'indigo', 'cream'],
    typical_patterns: ['Kalamkari', 'Block Print', 'Floral', 'Geometric'],
    material_category: 'Cotton',
    identifying_features: 'Hand-drawn or block-printed mythological/floral motifs, natural earthy dye colours, pen-drawn outlines, visible brushwork or block impressions',
    texture_keywords: ['hand-painted', 'natural-dye', 'block-printed', 'cotton', 'earthy']
  },
  {
    textile_type: 'Sambalpuri Ikat', origin: 'Sambalpur, Odisha',
    description: 'Traditional tie-dye textile where threads are resist-dyed before weaving, creating distinctive blurred-edge geometric patterns.',
    typical_colors: ['red', 'black', 'white', 'maroon', 'blue', 'green'],
    typical_patterns: ['Ikat', 'Geometric', 'Stripes', 'Checks'],
    material_category: 'Cotton',
    identifying_features: 'Blurred/feathered edges on patterns (hallmark of ikat), geometric motifs, tie-dye effect on warp/weft threads, handloom texture',
    texture_keywords: ['handloom', 'tie-dye', 'blurred', 'geometric', 'warp-dyed']
  },
  {
    textile_type: 'Chanderi', origin: 'Chanderi, Madhya Pradesh',
    description: 'Lightweight, sheer fabric with a glossy transparency. Combines silk and cotton for a unique texture. Traditional coin and peacock motifs.',
    typical_colors: ['gold', 'green', 'pink', 'cream', 'white', 'blue', 'beige'],
    typical_patterns: ['Brocade', 'Floral', 'Geometric', 'Subtle', 'Paisley'],
    material_category: 'Silk',
    identifying_features: 'Sheer and lightweight, glossy sheen, distinctive coin/peacock/floral buttis, gold zari borders, silk-cotton blend texture',
    texture_keywords: ['sheer', 'glossy', 'lightweight', 'translucent', 'delicate']
  },
  {
    textile_type: 'Bandhani', origin: 'Gujarat, Rajasthan',
    description: 'Traditional tie-and-dye fabric where cloth is pinched and tied with thread before dyeing, creating distinctive dot patterns.',
    typical_colors: ['red', 'yellow', 'orange', 'green', 'pink', 'maroon', 'blue'],
    typical_patterns: ['Bandhani', 'Geometric', 'Floral'],
    material_category: 'Cotton',
    identifying_features: 'Tiny circular dot patterns in regular grid, raised bumps from tied portions, vibrant multi-colour combinations, visible resist-dye halos around dots',
    texture_keywords: ['dotted', 'tied', 'bumpy', 'resist-dyed', 'vibrant']
  },
  {
    textile_type: 'Ajrakh', origin: 'Kutch, Gujarat / Sindh',
    description: 'Ancient block-printing technique using natural dyes on both sides of the fabric. Known for intricate geometric patterns in indigo and crimson.',
    typical_colors: ['indigo', 'red', 'black', 'teal', 'brown', 'white', 'blue'],
    typical_patterns: ['Ajrakh', 'Geometric', 'Block Print', 'Floral'],
    material_category: 'Cotton',
    identifying_features: 'Double-sided block printing, deep indigo and crimson natural dyes, intricate geometric star/medallion motifs, resist-printing technique',
    texture_keywords: ['block-print', 'double-sided', 'natural-dye', 'geometric', 'indigo']
  }
];

for (const k of knowledgeBase) {
  await db.insert('knowledge_base', { ...k, is_active: true });
}
console.log(`✅ ${knowledgeBase.length} knowledge base entries created`);

console.log('\n🎉 Database seeded successfully!\n');
await mongoose.disconnect();
process.exit(0);
}

seed().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
