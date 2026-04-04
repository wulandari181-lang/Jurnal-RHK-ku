import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Target, CalendarCheck, Camera, Plus, Trash2, 
  Image as ImageIcon, CheckCircle2, Clock, Calendar as CalendarIcon,
  BookOpen, Menu, X, Edit, Download, FolderOpen, Printer,
  ExternalLink, AlertCircle, CalendarPlus, LogIn, LogOut
} from 'lucide-react';

// FIREBASE IMPORTS & INITIALIZATION
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// TODO: GANTI DENGAN KODE FIREBASE CONFIG MILIKMU DARI CONSOLE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyAedUj0Y8TzMhjAQ16jZdeWSozXsbrEQDI",
  authDomain: "jurnal-rhk-ku.firebaseapp.com",
  projectId: "jurnal-rhk-ku",
  storageBucket: "jurnal-rhk-ku.firebasestorage.app",
  messagingSenderId: "34374323689",
  appId: "1:34374323689:web:b3578f2b53f86efbeb4f78",
  measurementId: "G-TSJ78SHPD7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // UI STATE
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [confirmModal, setConfirmModal] = useState({ show: false, message: '', onConfirm: null });
  const [showReminder, setShowReminder] = useState(false);

  // Data States
  const [rhkList, setRhkList] = useState([]); 
  const [monthlyTargets, setMonthlyTargets] = useState({}); 
  const [activities, setActivities] = useState([]); 

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // AUTH LISTENER
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsCheckingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // DATA FETCHING (Hanya berjalan jika user sudah login)
  useEffect(() => {
    if (!user) return;
    setIsSyncing(true);

    // Root collections untuk simplifikasi di Firebase milikmu
    const rhkRef = collection(db, `users/${user.uid}/rhks`);
    const unsubRhk = onSnapshot(rhkRef, (snap) => {
      setRhkList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const targetsRef = collection(db, `users/${user.uid}/monthlyTargets`);
    const unsubTargets = onSnapshot(targetsRef, (snap) => {
      const targets = {};
      snap.docs.forEach(d => { targets[d.id] = d.data().rhkIds || []; });
      setMonthlyTargets(targets);
    });

    const actRef = collection(db, `users/${user.uid}/activities`);
    const unsubAct = onSnapshot(actRef, (snap) => {
      const fetchedActivities = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setActivities(fetchedActivities);
      setIsSyncing(false);

      // Reminder Logic
      if (fetchedActivities.length > 0) {
        const sortedActs = [...fetchedActivities].sort((a,b) => new Date(b.date) - new Date(a.date));
        const lastActDate = new Date(sortedActs[0].date);
        const today = new Date();
        lastActDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        
        const diffTime = Math.abs(today - lastActDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        const lastReminderShown = localStorage.getItem(`lastReminder_${user.uid}`);
        const todayStr = today.toISOString().split('T')[0];

        if (diffDays >= 2 && lastReminderShown !== todayStr) {
          setShowReminder(true);
          localStorage.setItem(`lastReminder_${user.uid}`, todayStr);
        }
      }
    });

    return () => { unsubRhk(); unsubTargets(); unsubAct(); };
  }, [user]);

  // LOGIN FUNCTION
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
      alert("Gagal login dengan Google.");
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  // HELPER FUNCTIONS
  const getMonthName = (monthNumber) => {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return months[monthNumber - 1];
  };

  const formatDate = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const confirmAction = (message, onConfirm) => {
    setConfirmModal({ show: true, message, onConfirm });
  };

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height && width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          } else if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // LOGIN SCREEN
  if (isCheckingAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Memuat Aplikasi...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center">
          <img src="/logo1.jpeg" alt="Logo Jurnal RHKku" className="w-56 mx-auto mb-6" />
<p className="text-slate-500 mb-8 mt-2">Buku Kerja Digital & Rekap SKP Tahunan yang tersinkronisasi otomatis ke Cloud.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 px-4 rounded-xl font-bold transition-colors"
          >
            <LogIn size={20} /> Masuk dengan Akun Google
          </button>
        </div>
      </div>
    );
  }

  // --- KOMPONEN VIEW --- (Sama dengan sebelumnya)
  const NavItem = ({ id, icon: Icon, label }) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => { setActiveTab(id); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
          isActive 
            ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm ring-1 ring-indigo-100' 
            : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
        }`}
      >
        <Icon size={20} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
        <span>{label}</span>
      </button>
    );
  };

  // 1. DASHBOARD
  const DashboardView = () => {
    const currentMonthKey = `${currentYear}-${currentMonth}`;
    const targetCountThisMonth = monthlyTargets[currentMonthKey]?.length || 0;
    const activitiesThisMonth = activities.filter(a => {
      const d = new Date(a.date);
      return d.getFullYear() === currentYear && (d.getMonth() + 1) === currentMonth;
    });

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-2">Halo, {user.displayName?.split(' ')[0] || 'Selamat Bekerja'}! 👋</h1>
            <p className="text-indigo-100 opacity-90">
              Berikut adalah ringkasan kinerja Anda di bulan {getMonthName(currentMonth)} {currentYear}.
              <span className="ml-2 inline-flex items-center gap-1 text-xs bg-indigo-500/50 px-2 py-1 rounded-full"><CheckCircle2 size={12}/> Tersinkronisasi</span>
            </p>
          </div>
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
        </div>

        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm">
           <div className="p-4 bg-amber-100 text-amber-600 rounded-full shrink-0">
             <AlertCircle size={32} />
           </div>
           <div className="flex-1">
             <h3 className="text-lg font-bold text-amber-900 mb-1">Akses Cepat & Pengingat</h3>
             <p className="text-sm text-amber-700 mb-4">Pastikan Anda juga memperbarui data secara manual di portal resmi agar sinkron.</p>
             <div className="flex flex-wrap gap-3">
                <a href="#" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-800 text-sm font-medium border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors shadow-sm">
                  <ExternalLink size={16} className="text-blue-500"/> Portal Sipantas
                </a>
                <a href="#" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-800 text-sm font-medium border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors shadow-sm">
                  <ExternalLink size={16} className="text-emerald-500"/> Spreadsheet Rekap
                </a>
                <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-800 text-sm font-medium border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors shadow-sm">
                  <CalendarIcon size={16} className="text-red-500"/> Google Calendar
                </a>
             </div>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-indigo-200 cursor-pointer" onClick={() => setActiveTab('rhk')}>
            <div className="p-4 bg-blue-50 rounded-xl text-blue-600"><Target size={28} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total RHK Tahunan</p>
              <h3 className="text-2xl font-bold text-slate-800">{rhkList.filter(r => r.year === currentYear).length}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-indigo-200 cursor-pointer" onClick={() => setActiveTab('monthly')}>
            <div className="p-4 bg-emerald-50 rounded-xl text-emerald-600"><CalendarCheck size={28} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Target Bulan Ini</p>
              <h3 className="text-2xl font-bold text-slate-800">{targetCountThisMonth} RHK</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-indigo-200 cursor-pointer" onClick={() => setActiveTab('activity')}>
            <div className="p-4 bg-indigo-50 rounded-xl text-indigo-600"><BookOpen size={28} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Bukti Dukung Bulan Ini</p>
              <h3 className="text-2xl font-bold text-slate-800">{activitiesThisMonth.length}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4"><Clock size={20} className="text-indigo-500" />Aktivitas Terbaru Bulan Ini</h2>
          {activitiesThisMonth.length === 0 ? (
            <div className="text-center py-8"><p className="text-slate-500">Belum ada aktivitas.</p></div>
          ) : (
            <div className="space-y-4">
              {activitiesThisMonth.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5).map(act => {
                const rhk = rhkList.find(r => r.id === act.rhkId);
                return (
                  <div key={act.id} className="flex gap-4 p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                    {act.photoUrl ? (
                      <img src={act.photoUrl} alt="Bukti" className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0"><ImageIcon size={24} className="text-slate-300" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-indigo-600 font-semibold mb-1 truncate">{rhk?.title || 'RHK Dihapus'}</p>
                      <p className="text-slate-800 text-sm font-medium line-clamp-2">{act.description}</p>
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><CalendarIcon size={12} /> {formatDate(act.date)} • {act.time}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 2. RHK
  const RHKView = () => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [pimpinanRhk, setPimpinanRhk] = useState(''); 
    const [targetCount, setTargetCount] = useState(''); 

    const handleAddRhk = async (e) => {
      e.preventDefault();
      if (!title) return;
      const newId = Date.now().toString();
      const newRhk = { year: currentYear, title, description, pimpinanRhk, targetCount: Number(targetCount) || 1, createdAt: new Date().toISOString() };
      try {
        await setDoc(doc(db, `users/${user.uid}/rhks`, newId), newRhk);
        showToast('RHK berhasil ditambahkan!');
        setTitle(''); setDescription(''); setPimpinanRhk(''); setTargetCount('');
      } catch (err) { showToast('Gagal menyimpan', 'error'); }
    };

    const handleDeleteRhk = (id) => {
      confirmAction("Hapus RHK ini?", async () => {
        try { await deleteDoc(doc(db, `users/${user.uid}/rhks`, id)); showToast('Berhasil dihapus'); } 
        catch (err) { showToast('Gagal', 'error'); }
      });
    };

    const currentYearRhks = rhkList.filter(r => r.year === currentYear).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-xl font-bold mb-4">Manajemen RHK (Tahunan)</h2>
          <form onSubmit={handleAddRhk} className="space-y-4 mb-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
             <div><label className="block text-sm mb-1">RHK Pimpinan (Intervensi)</label><input type="text" value={pimpinanRhk} onChange={e=>setPimpinanRhk(e.target.value)} required className="w-full px-4 py-2 border rounded-xl" /></div>
             <div><label className="block text-sm mb-1">Rencana Hasil Kerja (RHK) Anda</label><input type="text" value={title} onChange={e=>setTitle(e.target.value)} required className="w-full px-4 py-2 border rounded-xl" /></div>
             <div className="flex gap-4">
               <div className="flex-1"><label className="block text-sm mb-1">Keterangan</label><input type="text" value={description} onChange={e=>setDescription(e.target.value)} className="w-full px-4 py-2 border rounded-xl" /></div>
               <div className="w-32"><label className="block text-sm mb-1">Jml Target</label><input type="number" value={targetCount} onChange={e=>setTargetCount(e.target.value)} required className="w-full px-4 py-2 border rounded-xl" /></div>
             </div>
             <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold">Simpan RHK</button>
          </form>
          
          <div className="space-y-4">
            {currentYearRhks.map((rhk, i) => (
              <div key={rhk.id} className="flex gap-4 p-4 border rounded-xl group">
                <div className="flex-1">
                  <p className="text-xs text-indigo-600 mb-1 flex items-center gap-1"><Target size={12}/> {rhk.pimpinanRhk}</p>
                  <h4 className="font-bold">{rhk.title}</h4>
                  <p className="text-sm text-slate-500">{rhk.description}</p>
                </div>
                <button onClick={() => handleDeleteRhk(rhk.id)} className="text-slate-400 hover:text-red-500 p-2"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 3. MONTHLY TARGET
  const MonthlyView = () => {
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const currentYearRhks = rhkList.filter(r => r.year === currentYear);
    const monthKey = `${currentYear}-${selectedMonth}`;
    const currentSelectedRhks = monthlyTargets[monthKey] || [];

    const toggleRhk = async (rhkId) => {
      const existing = [...currentSelectedRhks];
      const index = existing.indexOf(rhkId);
      if (index > -1) existing.splice(index, 1);
      else existing.push(rhkId);
      try {
        await setDoc(doc(db, `users/${user.uid}/monthlyTargets`, monthKey), { rhkIds: existing });
        showToast('Target diperbarui');
      } catch (err) { showToast('Error', 'error'); }
    };

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 animate-in fade-in duration-500">
        <h2 className="text-xl font-bold mb-6">Target Bulanan</h2>
        <select value={selectedMonth} onChange={e=>setSelectedMonth(Number(e.target.value))} className="mb-6 px-4 py-2 border rounded-xl w-full max-w-sm">
          {[...Array(12)].map((_, i) => (<option key={i+1} value={i+1}>{getMonthName(i+1)}</option>))}
        </select>
        <div className="grid gap-3">
          {currentYearRhks.map(rhk => {
            const isSelected = currentSelectedRhks.includes(rhk.id);
            return (
              <label key={rhk.id} className={`flex gap-4 p-4 border rounded-xl cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleRhk(rhk.id)} className="w-5 h-5 mt-0.5" />
                <div>
                  <h4 className={`font-semibold ${isSelected ? 'text-indigo-900' : ''}`}>{rhk.title}</h4>
                  <p className="text-xs text-slate-500">{rhk.pimpinanRhk}</p>
                </div>
              </label>
            )
          })}
        </div>
      </div>
    );
  };

  // 4. ACTIVITY RECORDING
  const ActivityView = () => {
    const [editingId, setEditingId] = useState(null);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [selectedRhkId, setSelectedRhkId] = useState('');
    const [description, setDescription] = useState('');
    const [photoUrl, setPhotoUrl] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [addToGCal, setAddToGCal] = useState(true);
    const fileInputRef = useRef(null);

    const availableRhkIds = monthlyTargets[`${new Date(date).getFullYear()}-${new Date(date).getMonth() + 1}`] || [];
    const availableRhks = rhkList.filter(r => availableRhkIds.includes(r.id));

    const handlePhoto = async (e) => {
      if (e.target.files[0]) {
        setIsUploading(true);
        try { setPhotoUrl(await compressImage(e.target.files[0])); } 
        catch (err) { showToast('Gagal proses foto', 'error'); } 
        finally { setIsUploading(false); }
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      const actData = { rhkId: selectedRhkId, date, time, description, photoUrl, updatedAt: new Date().toISOString() };
      try {
        if (editingId) {
          await setDoc(doc(db, `users/${user.uid}/activities`, editingId), actData, { merge: true });
          showToast('Diperbarui!');
        } else {
          actData.createdAt = new Date().toISOString();
          await setDoc(doc(db, `users/${user.uid}/activities`, Date.now().toString()), actData);
          showToast('Berhasil disimpan!');
          if (addToGCal) {
            const rhk = rhkList.find(r => r.id === selectedRhkId);
            window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('RHK: ' + rhk?.title)}&details=${encodeURIComponent(description)}&dates=${date.replace(/-/g,'')}/${date.replace(/-/g,'')}`, '_blank');
          }
        }
        setEditingId(null); setDescription(''); setPhotoUrl(null); setSelectedRhkId('');
      } catch (err) { showToast('Error', 'error'); }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold mb-6">{editingId ? 'Edit Bukti' : 'Catat Bukti'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} required className="w-full px-4 py-2 border rounded-xl" />
              <input type="time" value={time} onChange={e=>setTime(e.target.value)} required className="w-full px-4 py-2 border rounded-xl" />
            </div>
            <select value={selectedRhkId} onChange={e=>setSelectedRhkId(e.target.value)} required className="w-full px-4 py-2 border rounded-xl">
              <option value="" disabled>-- Pilih RHK Bulan Ini --</option>
              {rhkList.filter(r => availableRhkIds.includes(r.id) || r.id === selectedRhkId).map(r => (<option key={r.id} value={r.id}>{r.title}</option>))}
            </select>
            <div className="border-2 border-dashed p-4 rounded-xl text-center cursor-pointer" onClick={() => !photoUrl && fileInputRef.current?.click()}>
               {photoUrl ? <div className="relative group"><img src={photoUrl} className="w-full h-32 object-cover rounded-lg" alt="img"/><button type="button" onClick={(e)=>{e.stopPropagation();setPhotoUrl(null)}} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded">X</button></div> : <div className="text-slate-500 py-4"><Camera className="mx-auto mb-2"/>Upload Foto (Opsional)</div>}
               <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handlePhoto} />
            </div>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} required placeholder="Keterangan..." className="w-full px-4 py-2 border rounded-xl h-24"></textarea>
            {!editingId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addToGCal} onChange={e=>setAddToGCal(e.target.checked)}/> Buka Google Calendar otomatis</label>}
            <button type="submit" disabled={isUploading || !selectedRhkId} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">{editingId ? 'Update' : 'Simpan'}</button>
          </form>
        </div>
        
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 overflow-y-auto max-h-[700px]">
          <h3 className="font-bold mb-4">Riwayat</h3>
          <div className="space-y-4">
            {activities.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(act => (
              <div key={act.id} className="bg-white p-4 rounded-xl shadow-sm relative group">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-2">
                   <button onClick={()=>{setEditingId(act.id);setDate(act.date);setTime(act.time);setSelectedRhkId(act.rhkId);setDescription(act.description);setPhotoUrl(act.photoUrl);}}><Edit size={16} className="text-amber-500"/></button>
                   <button onClick={()=>confirmAction("Hapus?", ()=>deleteDoc(doc(db, `users/${user.uid}/activities`, act.id)))}><Trash2 size={16} className="text-red-500"/></button>
                </div>
                <p className="text-xs text-indigo-600 font-bold mb-1">{formatDate(act.date)}</p>
                <p className="text-sm">{act.description}</p>
                {act.photoUrl && <img src={act.photoUrl} className="w-full h-24 object-cover mt-2 rounded" alt="Bukti"/>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 5. REKAP
  const RekapView = () => {
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const filteredActivities = activities.filter(act => {
      const d = new Date(act.date);
      return d.getFullYear() === currentYear && (d.getMonth() + 1) === selectedMonth;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    const groupedActivities = filteredActivities.reduce((acc, act) => {
        if (!acc[act.rhkId]) acc[act.rhkId] = [];
        acc[act.rhkId].push(act);
        return acc;
    }, {});

    const generatePDF = () => {
      const opt = { margin: [15,15,15,15], filename: `Rekap_${currentYear}_${selectedMonth}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
      window.html2pdf().set(opt).from(document.getElementById('print-area')).save();
    };

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border animate-in fade-in duration-500">
        <div className="flex justify-between items-center mb-6 print:hidden">
           <h2 className="text-xl font-bold">Rekap & Unduh</h2>
           <button onClick={generatePDF} className="bg-slate-800 text-white px-4 py-2 rounded-xl flex items-center gap-2"><Printer size={18}/> Download PDF</button>
        </div>
        <select value={selectedMonth} onChange={e=>setSelectedMonth(Number(e.target.value))} className="mb-8 px-4 py-2 border rounded-xl w-full max-w-sm print:hidden">
            {[...Array(12)].map((_, i) => (<option key={i+1} value={i+1}>{getMonthName(i+1)}</option>))}
        </select>
        
        <div id="print-area" className="print-area pb-4">
           <h1 className="text-2xl font-bold text-center border-b pb-4 mb-8">Laporan Bulan {getMonthName(selectedMonth)} {currentYear}</h1>
           {Object.keys(groupedActivities).length === 0 ? <p className="text-center text-slate-500">Kosong</p> : 
             Object.entries(groupedActivities).map(([rhkId, acts]) => {
                const rhk = rhkList.find(r => r.id === rhkId);
                return (
                  <div key={rhkId} className="mb-8 break-inside-avoid">
                     <div className="bg-indigo-50 p-3 rounded-lg mb-4 font-bold text-indigo-900 border border-indigo-100">Folder: {rhk?.title}</div>
                     <div className="grid grid-cols-2 gap-4">
                       {acts.map(act => (
                         <div key={act.id} className="border p-3 rounded-lg flex flex-col">
                           {act.photoUrl ? <img src={act.photoUrl} className="w-full h-32 object-cover rounded bg-slate-100" alt="foto"/> : <div className="h-32 bg-slate-50 flex items-center justify-center text-xs">No Photo</div>}
                           <p className="text-xs font-bold mt-2">{formatDate(act.date)}</p>
                           <p className="text-sm mt-1">{act.description}</p>
                         </div>
                       ))}
                     </div>
                  </div>
                )
             })
           }
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Toast & Modals */}
      {showReminder && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl max-w-sm text-center">
            <h3 className="text-xl font-bold mb-2">Pengingat!</h3>
            <p className="mb-6">Sudah lebih dari 2 hari belum isi jurnal.</p>
            <button onClick={()=>{setShowReminder(false);setActiveTab('activity');}} className="w-full bg-indigo-600 text-white py-2 rounded-xl mb-2">Isi Sekarang</button>
            <button onClick={()=>setShowReminder(false)} className="w-full bg-slate-200 py-2 rounded-xl">Tutup</button>
          </div>
        </div>
      )}
      {toast.show && <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl z-50">{toast.message}</div>}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-xl w-80 text-center">
             <p className="mb-6">{confirmModal.message}</p>
             <div className="flex gap-2 justify-center">
               <button onClick={()=>setConfirmModal({show:false})} className="px-4 py-2 bg-slate-200 rounded">Batal</button>
               <button onClick={()=>{confirmModal.onConfirm();setConfirmModal({show:false})}} className="px-4 py-2 bg-red-500 text-white rounded">Ya</button>
             </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 h-screen w-72 bg-white border-r z-40 transition-transform ${isMobileMenuOpen?'translate-x-0':'-translate-x-full lg:translate-x-0'} print:hidden`}>
        <div className="p-6 border-b flex justify-between items-center">
  <div className="flex items-center">
    <img src="/logo1.jpeg" alt="Jurnal RHKku" className="h-10 object-contain" />
  </div>
  <button className="lg:hidden" onClick={()=>setIsMobileMenuOpen(false)}><X/></button>
</div>
        <div className="p-4 space-y-1">
          <NavItem id="dashboard" icon={Home} label="Dashboard" />
          <p className="text-xs font-bold text-slate-400 mt-4 mb-2 px-4">PERENCANAAN</p>
          <NavItem id="rhk" icon={Target} label="Manajemen RHK" />
          <NavItem id="monthly" icon={CalendarCheck} label="Target Bulanan" />
          <p className="text-xs font-bold text-slate-400 mt-4 mb-2 px-4">EKSEKUSI</p>
          <NavItem id="activity" icon={Camera} label="Catat Kegiatan" />
          <NavItem id="rekap" icon={Download} label="Rekap & Unduh" />
        </div>
        <div className="absolute bottom-0 w-full p-4 border-t bg-slate-50">
          <div className="flex justify-between items-center">
             <div className="truncate text-sm font-bold">{user.displayName || user.email}</div>
             <button onClick={handleLogout} className="text-red-500" title="Keluar"><LogOut size={18}/></button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 h-screen overflow-y-auto print:h-auto print:overflow-visible">
        <header className="lg:hidden p-4 bg-white border-b flex items-center justify-between print:hidden">
  <div className="flex items-center">
    <img src="/logo1.jpeg" alt="Jurnal RHKku" className="h-8 object-contain" />
  </div>
  <button onClick={()=>setIsMobileMenuOpen(true)}><Menu className="text-slate-600" /></button>
</header>
        <div className="p-4 lg:p-8 max-w-6xl mx-auto print:p-0 print:max-w-full">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'rhk' && <RHKView />}
          {activeTab === 'monthly' && <MonthlyView />}
          {activeTab === 'activity' && <ActivityView />}
          {activeTab === 'rekap' && <RekapView />}
        </div>
      </main>
    </div>
  );
}