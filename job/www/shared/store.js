import { native } from './bridge.js';
import { laptops } from './data.js';
const key = 'laptop_luxe_state';
function state(){ return native.storage.get(key, { favorites:[], cart:[], orders:[] }); }
function save(s){ native.storage.set(key, s); }
export async function listProducts({query='', category='All'}={}) { const q=query.toLowerCase(); return laptops.filter(p=>(category==='All'||p.category===category) && (!q||`${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q))); }
export async function getProduct(id){ return laptops.find(p=>p.id===id)||null; }
export async function listFavorites(){ const s=state(); return laptops.filter(p=>s.favorites.includes(p.id)); }
export async function toggleFavorite(id){ const s=state(); s.favorites=s.favorites.includes(id)?s.favorites.filter(x=>x!==id):[...s.favorites,id]; save(s); return s.favorites.includes(id); }
export async function isFavorite(id){ return state().favorites.includes(id); }
export async function listCart(){ const s=state(); return s.cart.map(id=>laptops.find(p=>p.id===id)).filter(Boolean); }
export async function addToCart(id){ const s=state(); if(!s.cart.includes(id)) s.cart.push(id); save(s); return listCart(); }
export async function removeFromCart(id){ const s=state(); s.cart=s.cart.filter(x=>x!==id); save(s); return listCart(); }
export async function placeOrder(details){ const s=state(); const items=s.cart.map(id=>laptops.find(p=>p.id===id)).filter(Boolean); if(!items.length) throw new Error('Your cart is empty'); s.orders.unshift({id:`LL-${Date.now().toString().slice(-6)}`, items, details, total:items.reduce((a,p)=>a+p.price,0), status:'Processing', date:new Date().toLocaleDateString()}); s.cart=[]; save(s); return s.orders[0]; }
export async function listOrders(){ return state().orders; }