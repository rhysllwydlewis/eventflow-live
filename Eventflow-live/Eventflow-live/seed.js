
const bcrypt = require('bcryptjs');
const { read, write, uid } = require('./store');
function seed(){
  const users = read('users');
  if(users.length===0){
    const admin    = { id: uid('usr'), name:'Admin', email:'admin@eventflow.local', role:'admin',    passwordHash:bcrypt.hashSync('Admin123!',10), createdAt:new Date().toISOString(), notify:true };
    const supplier = { id: uid('usr'), name:'Supplier Demo', email:'supplier@eventflow.local', role:'supplier', passwordHash:bcrypt.hashSync('Supplier123!',10), createdAt:new Date().toISOString(), notify:true };
    const customer = { id: uid('usr'), name:'Customer Demo', email:'customer@eventflow.local', role:'customer', passwordHash:bcrypt.hashSync('Customer123!',10), createdAt:new Date().toISOString(), notify:true };
    write('users', [admin, supplier, customer]);
  }
  if(read('suppliers').length===0){
    write('suppliers', [
      { id: uid('sup'), ownerUserId: null, name:'The Willow Barn Venue', category:'Venues', location:'Monmouthshire, South Wales', price_display:'From £1,500', website:'', license:'', amenities:['Parking','Garden'], maxGuests:120, photos:['https://source.unsplash.com/featured/800x600/?wedding,barn'], description_short:'Rustic countryside venue.', description_long:'Converted barn with indoor/outdoor spaces.', email:'willowbarn@example.com', approved:true },
      { id: uid('sup'), ownerUserId: null, name:'Green Oak Catering', category:'Catering', location:'Cardiff & South Wales', price_display:'££', website:'', license:'', amenities:['Vegan options','Serving staff'], maxGuests:500, photos:['https://source.unsplash.com/featured/800x600/?catering,food'], description_short:'Seasonal menus with local produce.', description_long:'Buffets and formal dining. Vegan options.', email:'greenoakcatering@example.com', approved:true },
      { id: uid('sup'), ownerUserId: null, name:'Snapshot Photography', category:'Photography', location:'Bristol & South West', price_display:'From £800', website:'', license:'', amenities:['Online gallery'], maxGuests:0, photos:['https://source.unsplash.com/featured/800x600/?wedding,photography'], description_short:'Relaxed documentary style.', description_long:'Full-day or hourly packages.', email:'snapshotphoto@example.com', approved:true }
    ]);
  }
  if(read('packages').length===0){
    const s = read('suppliers');
    write('packages', [
      { id: uid('pkg'), supplierId:s[0].id, title:'Barn Exclusive', price:'£3,500', description:'Full-day venue hire, ceremony & reception areas.', image:'https://source.unsplash.com/featured/800x600/?rustic,venue', approved:true, featured:true },
      { id: uid('pkg'), supplierId:s[1].id, title:'Seasonal Feast', price:'£45 pp', description:'Three-course seasonal menu with staff & setup.', image:'https://source.unsplash.com/featured/800x600/?banquet,catering', approved:true, featured:false },
      { id: uid('pkg'), supplierId:s[2].id, title:'Full Day Capture', price:'£1,200', description:'Prep through first dance, private gallery.', image:'https://source.unsplash.com/featured/800x600/?camera,photography', approved:true, featured:false }
    ]);
  }
  for(const name of ['plans','notes','messages','threads','events']){ if(read(name).length===0) write(name, []); }
}
module.exports = { seed };
