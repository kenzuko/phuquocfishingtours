const $=s=>document.querySelector(s);
const esc=v=>String(v??"");
function fmtDate(v){
  if(!v)return "-";
  const d=new Date(v+"T12:00:00");
  return new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Ho_Chi_Minh"}).format(d);
}
function money(v,c){
  if(!v)return "To be settled";
  return new Intl.NumberFormat(c==="VND"?"vi-VN":"en-US").format(Number(v))+" "+(c||"VND");
}
function setStep(id,done,current=false){
  const el=$(id); el.classList.toggle("done",Boolean(done)); el.classList.toggle("current",Boolean(current&&!done));
}
function initials(name){
  return String(name||"D").split(/\s+/).filter(Boolean).slice(-2).map(x=>x[0]).join("").toUpperCase();
}
async function load(){
  const token=location.pathname.split("/").filter(Boolean).pop();
  try{
    const r=await fetch("/api/public/trips/"+encodeURIComponent(token),{cache:"no-store"});
    if(!r.ok)throw new Error(r.status===404?"This trip link is no longer available.":"Unable to load trip.");
    const t=await r.json();
    $("#trip-loading").classList.add("hidden");
    $("#trip-content").classList.remove("hidden");
    document.title=(t.representative?esc(t.representative)+" - ":"")+"Your Fishing Trip - JoTrip";
    $("#trip-code").textContent=t.booking_code||"JoTrip";
    $("#hero-date").textContent=fmtDate(t.service_date);
    $("#hero-tour").textContent=t.tour_type||"Private Fishing Tour";
    $("#pickup-time").textContent=t.pickup_time||"-";
    $("#pickup-location").textContent=t.pickup_location||"Pickup details will be updated.";
    $("#trip-time").textContent=[t.start_time,t.end_time].filter(Boolean).join(" - ")||"-";
    $("#guest-count").textContent=t.guests||"-";
    $("#trip-total").textContent=money(t.total_amount,t.currency);
    $("#payment-method").textContent=t.payment_method&&t.payment_method!=="unknown"?t.payment_method:"Payment arrangement confirmed with JoTrip";

    const items=String(t.inclusions||"Private fishing service").split(/[,;]\s*/).filter(Boolean);
    $("#inclusions").innerHTML=items.map(x=>'<span class="inclusion">'+esc(x)+'</span>').join("");

    $("#weather-label").textContent=t.weather?.label||"Weather check scheduled";
    $("#weather-detail").textContent=t.weather?.detail||"A final operating check will be made before your trip.";
    $("#weather-icon").textContent=t.weather?.key==="hold"?"☁":t.weather?.key==="modify"?"◐":t.weather?.key==="cancel"?"!":"☀";

    if(t.driver){
      $("#driver-content").innerHTML='<div class="driver-main"><div class="driver-avatar">'+initials(t.driver.name)+'</div><div><strong>'+esc(t.driver.name)+'</strong><span>'+esc([t.driver.vehicle_model,t.driver.vehicle_plate].filter(Boolean).join(" · ")||"Your pickup driver")+'</span><small>'+esc(t.driver.phone||"Contact details available through JoTrip")+'</small></div></div>'+(t.driver.note?'<p>'+esc(t.driver.note)+'</p>':'');
    }else{
      $("#driver-content").innerHTML='<div class="driver-pending"><span>◷</span><div><strong>Driver details coming soon</strong><small>We will update the driver before pickup.</small></div></div>';
    }
    if(t.special_request){
      $("#special-card").classList.remove("hidden");
      $("#special-request").textContent=t.special_request;
    }
    if(t.cancelled)$("#cancel-banner").classList.remove("hidden");

    const p=t.progress||{};
    setStep("#step-booking",p.booking_confirmed,!p.booking_confirmed);
    setStep("#step-boat",p.boat_arranged,p.booking_confirmed&&!p.boat_arranged);
    setStep("#step-driver",p.driver_assigned,p.boat_arranged&&!p.driver_assigned);
    setStep("#step-ready",p.ready_for_pickup,p.driver_assigned&&!p.ready_for_pickup);
  }catch(e){
    $("#trip-loading").classList.add("hidden");
    $("#trip-error").textContent=e.message;
    $("#trip-error").classList.remove("hidden");
  }
}
load();
