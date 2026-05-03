import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Target, CalendarCheck, Camera, Plus, Trash2, 
  Image as ImageIcon, CheckCircle2, Clock, Calendar as CalendarIcon,
  BookOpen, Menu, X, Edit, Download, FolderOpen, Printer,
  ExternalLink, AlertCircle, LogIn, LogOut
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getOrCreateFolder, uploadToDrive } from './driveService';

const firebaseConfig = {
  apiKey: "AIzaSyAasR_3r9sGjuZMUgLcVsQv15bighP24Fo",
  authDomain: "jurnal-rhkku-v2.firebaseapp.com",
  projectId: "jurnal-rhkku-v2",
  storageBucket: "jurnal-rhkku-v2.firebasestorage.app",
  messagingSenderId: "61657994242",
  appId: "1:61657994242:web:cf7903d3f3966bccef831b",
  measurementId: "G-EXCNTMVXGQ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
const db = getFirestore(app);

// 👇 PENGATURAN ADMIN (Ganti dengan Email Google Kakak)
const ADMIN_EMAIL = "setiyawulandari181@gmail.com"; 

// 👇 KOMPONEN BARU: Penjemput Foto Rahasia dari Google Drive (VERSI INFORMATIF)
const SmartImage = ({ source, className, alt }) => {
  const [imgSrc, setImgSrc] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null); // <-- State baru penyimpan rahasia error

  useEffect(() => {
    if (!source) return;
    if (source.length > 1000 || source.startsWith('http')) {
      setImgSrc(source);
      return;
    }
    
    const fetchImage = async () => {
      try {
        const token = localStorage.getItem('googleDriveToken');
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${source}?alt=media`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
          setImgSrc('expired');
        } else if (response.ok) {
          const blob = await response.blob();
          setImgSrc(URL.createObjectURL(blob));
        } else {
          // Tangkap pesan asli dari Google jika gagal
          const errData = await response.json();
          setErrorDetail(errData.error?.message || `HTTP Error: ${response.status}`);
          setImgSrc('error');
        }
      } catch (err) {
        // Tangkap error jaringan (misal: internet putus)
        setErrorDetail(err.message || "Koneksi terputus / diblokir");
        setImgSrc('error');
      }
    };
    fetchImage();
  }, [source]);

  // 1. Tampilan jika sesi habis (Relogin)
  if (imgSrc === 'expired') return (
    <div className={`flex flex-col items-center justify-center bg-amber-50 text-amber-600 text-[10px] font-bold text-center p-2 border border-amber-200 rounded-lg shadow-sm ${className}`}>
      <span className="text-lg mb-1">⏱️</span>Sesi Habis<br/>Harap Relogin
    </div>
  );

  // 2. Tampilan jika error sistem (Cantik, tapi memunculkan detail saat di-hover/disentuh)
  if (imgSrc === 'error') return (
    <div className={`flex flex-col items-center justify-center bg-red-50 text-red-500 p-2 border border-red-200 rounded-lg overflow-hidden relative group cursor-help shadow-sm ${className}`}>
      <span className="text-lg mb-1">⚠️</span>
      <span className="text-[10px] font-bold text-center leading-tight">Gagal Muat</span>
      
      {/* Tooltip Rahasia: Hanya muncul saat di-hover / ditekan tahan */}
      <div className="absolute inset-0 bg-slate-800 text-white text-[9px] p-2 flex items-center justify-center text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 break-words">
        {errorDetail}
      </div>
    </div>
  );

  // 3. Tampilan saat loading
  if (!imgSrc) return (
    <div className={`flex flex-col items-center justify-center bg-slate-50 text-slate-400 text-[10px] font-bold animate-pulse border border-slate-200 rounded-lg ${className}`}>
      <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mb-1"></div>
      Memuat...
    </div>
  );
  
  // 4. Tampilan gambar normal
  return <img src={imgSrc} className={`${className} object-cover rounded-lg`} alt={alt} crossOrigin="anonymous" />;
};

// 👇 FUNGSI PENDETEKSI LINK OTOMATIS
const formatTextWithLinks = (text) => {
  if (!text) return text;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline break-all">{part}</a>;
    }
    return part;
  });
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false); 
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
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);

  // AUTH LISTENER
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsAdmin(currentUser.email === ADMIN_EMAIL);
      } else {
        setIsAdmin(false);
      }
      setIsCheckingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // DATA FETCHING 
  useEffect(() => {
    if (!user) return;
    setIsSyncing(true);

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

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        localStorage.setItem('googleDriveToken', credential.accessToken);
      }
    } catch (error) {
      console.error("Login failed", error);
      alert("Gagal login dengan Google.");
    }
  };

  const handleLogout = () => {
    signOut(auth);
    localStorage.removeItem('googleDriveToken'); 
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
  
  // 👇 HELPER BARU UNTUK RENTANG TANGGAL (Rabu - Jumat, 8 - 10 April 2026)
  const formatCustomDateRange = (startDateStr, endDateStr) => {
    if (!endDateStr) return formatDate(startDateStr);
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    if (start.getFullYear() !== end.getFullYear()) {
       return `${days[start.getDay()]} - ${days[end.getDay()]}, ${start.getDate()} ${months[start.getMonth()]} ${start.getFullYear()} - ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
    } else if (start.getMonth() !== end.getMonth()) {
       return `${days[start.getDay()]} - ${days[end.getDay()]}, ${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]} ${start.getFullYear()}`;
    } else {
       return `${days[start.getDay()]} - ${days[end.getDay()]}, ${start.getDate()} - ${end.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const confirmAction = (message, onConfirm) => {
    setConfirmModal({ show: true, message, onConfirm });
  };

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
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
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = (err) => reject(err);
        img.src = event.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

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
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">
                Halo {isAdmin ? 'Ratu' : 'Baginda'}, {user.displayName?.split(' ')[0]}! 👋
              </h1>
              {isAdmin ? (
                <span className="bg-[#E6E6FA] text-slate-800 text-[10px] uppercase px-3 py-1 rounded-full font-extrabold shadow-sm flex items-center gap-1 tracking-wider">
                  ✨ Mode Admin ✨
                </span>
              ) : (
                <span className="bg-white/20 text-white text-[10px] uppercase px-2.5 py-1 rounded-full font-bold shadow-sm">
                  👤 Mode User
                </span>
              )}
            </div>
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
                <a href="https://kedaton.gresikkab.go.id/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-800 text-sm font-medium border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors shadow-sm">
                  <ExternalLink size={16} className="text-blue-500"/> Portal Sipantas
                </a>
                {isAdmin && (
                <a href="https://docs.google.com/spreadsheets/d/1nCIuDdQbvwFXK5ak7nbWTnLyZuw87PAZgnwFGHqtwFs/edit?usp=sharing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-800 text-sm font-medium border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors shadow-sm">
                  <ExternalLink size={16} className="text-emerald-500"/> Spreadsheet Rekap SKP
                </a>
                )}
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
              <p className="text-sm text-slate-500 font-medium">Target {getMonthName(currentMonth)} {currentYear}</p>
              <h3 className="text-2xl font-bold text-slate-800">{targetCountThisMonth} RHK</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-indigo-200 cursor-pointer" onClick={() => setActiveTab('activity')}>
            <div className="p-4 bg-indigo-50 rounded-xl text-indigo-600"><BookOpen size={28} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Bukti {getMonthName(currentMonth)} {currentYear}</p>
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
                const firstPhoto = act.driveFileIds && act.driveFileIds.length > 0 ? act.driveFileIds[0] : (act.photoUrls && act.photoUrls.length > 0 ? act.photoUrls[0] : act.photoUrl);
                
                return (
                  <div key={act.id} className="flex gap-4 p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                    {firstPhoto ? (
                      <SmartImage source={firstPhoto} className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0" alt="Bukti" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0"><ImageIcon size={24} className="text-slate-300" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-indigo-600 font-semibold mb-1 truncate">{rhk?.title || 'RHK Dihapus'}</p>
                      <p className="text-sm text-slate-800 leading-relaxed font-medium whitespace-pre-wrap">{formatTextWithLinks(act.description)}</p>
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

  // 2. RHK VIEW
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
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Manajemen RHK (Tahunan)</h1>
            <p className="text-slate-500 text-sm mt-1">Buat Rencana Hasil Kerja Anda untuk tahun {currentYear}. Tersimpan otomatis ke Cloud.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
             <h2 className="text-lg font-bold mb-6 text-slate-800 flex items-center gap-2">
               <Plus className="text-slate-800" size={20} /> Tambah RHK Baru
             </h2>
             <form onSubmit={handleAddRhk} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">RHK Pimpinan yang Diintervensi</label>
                  <input type="text" value={pimpinanRhk} onChange={e=>setPimpinanRhk(e.target.value)} required placeholder="Misal: Terwujudnya tata kelola pemerintahan yang baik..." className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Rencana Hasil Kerja (RHK) Anda</label>
                  <input type="text" value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Misal: Tersusunnya Laporan Keuangan Tahunan" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Indikator / Keterangan</label>
                    <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Indikator pencapaian RHK ini..." rows="2" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jumlah Target</label>
                    <input type="number" value={targetCount} onChange={e=>setTargetCount(e.target.value)} required placeholder="Misal: 12" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm" />
                  </div>
                </div>
                <div className="pt-2">
                  <button type="submit" className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm transition-all active:scale-95 text-sm">
                    Simpan RHK
                  </button>
                </div>
             </form>
          </div>
        </div>

        <div className="pt-4">
          <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
            Daftar RHK Tahun {currentYear} ({currentYearRhks.length})
          </h2>
          <div className="space-y-4">
            {currentYearRhks.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl border border-slate-100">
                <p className="text-slate-400 italic">Belum ada data RHK yang ditambahkan.</p>
              </div>
            ) : (
              currentYearRhks.map((rhk, i) => (
                <div key={rhk.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex gap-4 relative group hover:border-indigo-100 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 pr-10">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Target size={14} className="text-indigo-600" />
                      <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide">INTERVENSI: {rhk.pimpinanRhk}</p>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1.5 leading-snug">{rhk.title}</h3>
                    <p className="text-sm text-slate-500 mb-3">{rhk.description || 'dokumen'}</p>
                    <div className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-100">
                      <CheckCircle2 size={14} className="text-slate-400" /> Target: {rhk.targetCount} Indikator
                    </div>
                  </div>
                  <button onClick={() => handleDeleteRhk(rhk.id)} className="absolute top-5 right-5 text-slate-300 hover:text-red-500 transition-colors" title="Hapus">
                    <Trash2 size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  // 3. MONTHLY TARGET
  const MonthlyView = () => {
    const currentYearRhks = rhkList.filter(r => r.year === currentYear);
    const monthKey = `${currentYear}-${targetMonth}`; 
    const currentSelectedRhks = monthlyTargets[monthKey] || [];

    const uncheckedRhks = currentYearRhks.filter(rhk => !currentSelectedRhks.includes(rhk.id));
    const checkedRhks = currentYearRhks.filter(rhk => currentSelectedRhks.includes(rhk.id));

    const handleToggleRhk = async (rhk, isSelected) => {
      if (isSelected) {
        confirmAction(`Yakin ingin membatalkan "${rhk.title}" dari target bulan ini?`, async () => {
          const existing = currentSelectedRhks.filter(id => id !== rhk.id);
          try {
            await setDoc(doc(db, `users/${user.uid}/monthlyTargets`, monthKey), { rhkIds: existing });
            showToast('Target bulanan dibatalkan');
          } catch (err) { showToast('Error', 'error'); }
        });
      } else {
        const existing = [...currentSelectedRhks, rhk.id];
        try {
          await setDoc(doc(db, `users/${user.uid}/monthlyTargets`, monthKey), { rhkIds: existing });
          showToast('✅ RHK berhasil ditambahkan ke target!');
        } catch (err) { showToast('Error', 'error'); }
      }
    };

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 animate-in fade-in duration-500 max-w-4xl">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Target RHK Bulanan</h2>
          <p className="text-slate-500 text-sm">Pilih RHK yang akan Anda kerjakan dan kumpulkan buktinya di bulan tertentu.</p>
        </div>

        <div className="mb-10">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Pilih Bulan Target</label>
          <select 
            value={targetMonth} 
            onChange={e=>setTargetMonth(Number(e.target.value))} 
            className="w-full md:w-1/2 lg:w-1/3 px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-700"
          >
            {[...Array(12)].map((_, i) => (
              <option key={i+1} value={i+1}>{getMonthName(i+1)} {currentYear}</option>
            ))}
          </select>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
            <h3 className="text-slate-700 font-semibold flex items-center gap-2">
              Daftar RHK Tersedia ({uncheckedRhks.length})
            </h3>
          </div>
          <div className="grid gap-3">
            {uncheckedRhks.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm italic border border-dashed rounded-xl border-slate-200">
                Semua RHK sudah masuk target bulan ini.
              </div>
            ) : (
              uncheckedRhks.map(rhk => (
                <div key={rhk.id} onClick={() => handleToggleRhk(rhk, false)} className="flex gap-4 p-4 border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-slate-50 transition-all group">
                  <div className="mt-0.5 w-6 h-6 rounded border-2 border-slate-300 group-hover:border-indigo-400 shrink-0 flex items-center justify-center bg-white transition-colors"></div>
                  <div>
                    <h4 className="font-bold text-slate-800 mb-1">{rhk.title}</h4>
                    <p className="text-[11px] font-medium text-slate-500">Intervensi: {rhk.pimpinanRhk}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {checkedRhks.length > 0 && (
          <div className="mt-10 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-4 border-b border-indigo-100 pb-2">
              <h3 className="text-indigo-800 font-bold">Target Terpilih</h3>
              <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">
                {checkedRhks.length} Dipilih
              </span>
            </div>
            <div className="grid gap-3">
              {checkedRhks.map(rhk => (
                <div key={rhk.id} onClick={() => handleToggleRhk(rhk, true)} className="flex gap-4 p-4 border border-indigo-500 bg-indigo-50/50 rounded-xl cursor-pointer hover:bg-indigo-100/50 transition-all">
                  <div className="mt-0.5 w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
                    <CheckCircle2 size={18} strokeWidth={3} />
                  </div>
                  <div>
                    <h4 className="font-bold text-indigo-900 mb-1">{rhk.title}</h4>
                    <p className="text-[11px] font-medium text-indigo-600/80">Intervensi: {rhk.pimpinanRhk}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

 // 4. ACTIVITY RECORDING 
  const ActivityView = () => {
    const [editingId, setEditingId] = useState(null);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [isMultiDay, setIsMultiDay] = useState(false);
    const [endDate, setEndDate] = useState(''); 
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [selectedRhkIds, setSelectedRhkIds] = useState(['']); 
    const [description, setDescription] = useState('');
    const [realisasi, setRealisasi] = useState('');
    const [isCompleted, setIsCompleted] = useState(false);
    
    const [photoUrls, setPhotoUrls] = useState([]);
    const [existingDriveIds, setExistingDriveIds] = useState([]); 
    const [isUploading, setIsUploading] = useState(false);
    const [addToGCal, setAddToGCal] = useState(true);
    const fileInputRef = useRef(null);
    const [viewingPhotos, setViewingPhotos] = useState(null);

    const selectedMonthNum = parseInt(date.split('-')[1], 10);
    const selectedYearNum = parseInt(date.split('-')[0], 10);
    const selectedMonthName = getMonthName(selectedMonthNum);
    
    const availableRhkIds = monthlyTargets[`${selectedYearNum}-${selectedMonthNum}`] || [];
    const availableRhks = rhkList.filter(r => availableRhkIds.includes(r.id));

    const handlePhoto = async (e) => {
      if (e.target.files.length > 0) {
        setIsUploading(true);
        try {
          const newPhotosRaw = [];
          for (let i = 0; i < e.target.files.length; i++) {
            const compressed = await compressImage(e.target.files[i]);
            newPhotosRaw.push(compressed);
          }
          setPhotoUrls(prev => [...prev, ...newPhotosRaw]);
        } 
        catch (err) { showToast('Gagal memproses foto', 'error'); } 
        finally { setIsUploading(false); }
      }
    };

    const handleDeletePhotoFromPreview = (index) => setPhotoUrls(prev => prev.filter((_, i) => i !== index));

    const handleSubmit = async (e) => {
      e.preventDefault();
      const validRhkIds = selectedRhkIds.filter(id => id !== '');
      if (validRhkIds.length === 0) return showToast('Silakan pilih minimal 1 RHK', 'error');
      if (isMultiDay && !endDate) return showToast('Pilih Tanggal Selesai!', 'error');

      setIsUploading(true); 

      try {
        const year = date.split('-')[0];
        const monthName = getMonthName(parseInt(date.split('-')[1], 10));

        const mainFolderId = await getOrCreateFolder("Jurnal_RHK_Digital");
        const yearFolderId = await getOrCreateFolder(year, mainFolderId);
        const monthFolderId = await getOrCreateFolder(monthName, yearFolderId);

        const now = Date.now();
        const cleanDesc = description.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30); 

        for (let i = 0; i < validRhkIds.length; i++) {
          const rhkId = validRhkIds[i];
          const rhk = rhkList.find(r => r.id === rhkId);
          const cleanRhkTitle = rhk?.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 60);
          const rhkFolderId = await getOrCreateFolder(cleanRhkTitle, monthFolderId);

          let driveFileIds = [...existingDriveIds];

          if (photoUrls.length > 0) {
            for (let pIdx = 0; pIdx < photoUrls.length; pIdx++) {
              const fileName = `${date}_${time.replace(':','-')}_${cleanDesc}_${i}_${pIdx}.jpg`;
              const fileId = await uploadToDrive(photoUrls[pIdx], fileName, rhkFolderId);
              driveFileIds.push(fileId);
            }
          }

          const actData = { 
            rhkId, 
            date, 
            endDate: isMultiDay ? endDate : null,
            time, 
            description,
            realisasi: realisasi ? Number(realisasi) : null, 
            isCompleted, // 👈 Simpan status selesai ke database
            driveFileIds, 
            updatedAt: new Date().toISOString() 
          };

          if (editingId) {
            await setDoc(doc(db, `users/${user.uid}/activities`, editingId), actData, { merge: true });
          } else {
            actData.createdAt = new Date().toISOString();
            await setDoc(doc(db, `users/${user.uid}/activities`, (now + i).toString()), actData);
          }
        }

        showToast(editingId ? 'Data diperbarui!' : 'Tersimpan rapi di Google Drive!');
        
        if (addToGCal) {
          const rhk = rhkList.find(r => r.id === validRhkIds[0]);
          const calDateStart = date.replace(/-/g,'');
          const calDateEnd = isMultiDay ? new Date(new Date(endDate).getTime() + 86400000).toISOString().split('T')[0].replace(/-/g,'') : calDateStart;
          window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(description)}&details=${encodeURIComponent('RHK: ' + rhk?.title)}&dates=${calDateStart}/${calDateEnd}`, '_blank');
        }

        setEditingId(null); 
        setDescription(''); 
        setPhotoUrls([]); 
        setSelectedRhkIds(['']);
        setExistingDriveIds([]);
        setIsMultiDay(false);
        setEndDate('');
        setIsCompleted(false); // Reset centang selesai
        setRealisasi('');
        setAddToGCal(true);

      } catch (err) { 
        showToast(`Gagal: ${err.message}`, 'error'); 
      } finally {
        setIsUploading(false);
      }
    };

    const totalPreviewPhotos = existingDriveIds.length + photoUrls.length;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500 relative">
        <div className="lg:col-span-7">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-800">{editingId ? 'Edit Bukti Dukung' : 'Catat Bukti Dukung'}</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                   <label className="text-sm font-bold text-slate-700">Waktu Pelaksanaan</label>
                   <label className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-100/50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                     <input type="checkbox" checked={isMultiDay} onChange={e => { setIsMultiDay(e.target.checked); if(!e.target.checked) setEndDate(''); }} className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
                     Lebih dari 1 hari?
                   </label>
                </div>
                <div className={`grid gap-4 ${isMultiDay ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isMultiDay ? 'Tgl Mulai' : 'Tanggal'}</label>
                    <input type="date" value={date} onChange={e=>setDate(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                  </div>
                  {isMultiDay && (
                    <div className="animate-in slide-in-from-left-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tgl Selesai</label>
                      <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} min={date} required className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jam / Waktu</label>
                    <input type="time" value={time} onChange={e=>setTime(e.target.value)} required className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                  </div>
                </div>
              </div>

              {/* 👇 BUG FIX: RHK DROPDOWN DIBIKIN ANTI-OVERFLOW */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">Pilih RHK (Target Bulan {selectedMonthName})</label>
                <div className="space-y-3">
                  {selectedRhkIds.map((rhkId, index) => (
                    <div key={index} className="flex w-full items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                      <select 
                        value={rhkId} 
                        onChange={(e) => {
                          const newSelected = [...selectedRhkIds];
                          newSelected[index] = e.target.value;
                          setSelectedRhkIds(newSelected);
                        }} 
                        required 
                        className="flex-1 min-w-0 px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-slate-700 appearance-none"
                      >
                        <option value="" disabled>-- Pilih RHK dari Target Bulan Ini --</option>
                        {availableRhks.map(r => (
                          <option key={r.id} value={r.id} disabled={selectedRhkIds.includes(r.id) && r.id !== rhkId}>{r.title}</option>
                        ))}
                      </select>
                      
                      {!editingId && selectedRhkIds.length > 1 && (
                        <button type="button" onClick={() => setSelectedRhkIds(prev => prev.filter((_, i) => i !== index))} className="shrink-0 p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors bg-slate-50 border border-slate-100">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                
                {!editingId && availableRhks.length > selectedRhkIds.length && (
                  <button type="button" onClick={() => setSelectedRhkIds([...selectedRhkIds, ''])} className="mt-3 text-xs font-bold text-indigo-600 flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors w-fit">
                    <Plus size={14} /> Tambah RHK Lainnya
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Upload Foto Bukti <span className="text-slate-400 font-normal">(Opsional)</span></label>
                <div className={`border-2 border-dashed ${totalPreviewPhotos > 0 ? 'border-indigo-100 p-4' : 'border-slate-200 p-8'} rounded-2xl text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all`} onClick={() => fileInputRef.current?.click()}>
                   {totalPreviewPhotos > 0 ? (
                     <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                       {existingDriveIds.map((id, index) => (
                         <div key={`ext-${index}`} className="relative aspect-square group">
                           <SmartImage source={id} className="w-full h-full object-cover rounded-lg border border-slate-100 shadow-sm" alt={`Lama ${index+1}`}/>
                           <button type="button" onClick={(e)=>{e.stopPropagation(); setExistingDriveIds(prev => prev.filter((_, i) => i !== index));}} className="absolute top-1 right-1 bg-red-500/90 hover:bg-red-600 text-white p-1 rounded-md transition-all shadow-md"><X size={14} /></button>
                         </div>
                       ))}
                       {photoUrls.map((url, index) => (
                         <div key={`new-${index}`} className="relative aspect-square group">
                           <img src={url} className="w-full h-full object-cover rounded-lg border border-slate-100 shadow-sm" alt={`Baru ${index+1}`}/>
                           <button type="button" onClick={(e)=>{e.stopPropagation(); handleDeletePhotoFromPreview(index)}} className="absolute top-1 right-1 bg-red-500/90 hover:bg-red-600 text-white p-1 rounded-md transition-all shadow-md"><X size={14} /></button>
                         </div>
                       ))}
                       <div className="aspect-square rounded-lg border-2 border-dashed border-indigo-200 bg-white flex items-center justify-center text-indigo-400 group-hover:border-indigo-400"><Plus size={20}/></div>
                     </div>
                   ) : (
                     <div className="py-2">
                       <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3"><Camera size={26} strokeWidth={2.5} /></div>
                       <p className="text-sm font-bold text-slate-700 mb-1">Klik untuk upload foto</p>
                       <p className="text-[11px] text-slate-500">Bisa memilih banyak foto sekaligus.</p>
                     </div>
                   )}
                </div>
                <input type="file" accept="image/*" multiple className="hidden" ref={fileInputRef} onChange={handlePhoto} />
              </div>

              {/* 👇 KOTAK INPUT REALISASI KHUSUS ADMIN */}
              {isAdmin && (
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 animate-in fade-in">
                  <label className="flex items-center gap-2 text-sm font-bold text-indigo-900 mb-2">
                    <Target size={16} className="text-indigo-600"/> 
                    Jumlah Realisasi (Khusus Mode Admin ✨)
                  </label>
                  <input 
                    type="number" 
                    value={realisasi} 
                    onChange={e => setRealisasi(e.target.value)} 
                    placeholder="Masukkan angka capaian (Misal: 100)" 
                    className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                  />
                  <p className="text-[10px] text-indigo-500 mt-1.5 font-medium">Angka ini akan dijumlahkan otomatis di Laporan PDF.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Keterangan / Hasil Pekerjaan</label>
                <textarea 
                  value={description} onChange={e=>setDescription(e.target.value)} required 
                  placeholder="Misal: Telah diselesaikan penyusunan 120 dokumen arsip..." 
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm min-h-[110px] resize-none"
                ></textarea>
              </div>

              {/* 👇 CHECKBOX STATUS SELESAI */}
              <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${isCompleted ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                <input type="checkbox" checked={isCompleted} onChange={e=>setIsCompleted(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" /> 
                <div className="flex flex-col">
                  <span className={`text-sm font-bold ${isCompleted ? 'text-emerald-800' : 'text-slate-700'}`}>Tandai sebagai "Selesai"</span>
                  <span className="text-[11px] text-slate-500">Akan memunculkan label/status Selesai di laporan PDF.</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 border border-slate-100 rounded-xl bg-slate-50/80 cursor-pointer hover:bg-slate-100 transition-colors">
                <input type="checkbox" checked={addToGCal} onChange={e=>setAddToGCal(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /> 
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <CalendarIcon size={18} className="text-red-500" /> 
                    {editingId ? 'Buat Jadwal Baru di Kalender' : 'Tandai di Kalender'}
                  </div>
                  {editingId && (
                    <span className="text-[11px] text-amber-600 font-medium mt-0.5">Centang ini jika Anda mengubah tanggal. (Jadwal lama di kalender hapus manual).</span>
                  )}
                </div>
              </label>

              <button type="submit" disabled={isUploading || selectedRhkIds[0] === ''} className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed">
                <CheckCircle2 size={20} /> {editingId ? 'Update Bukti Dukung' : 'Simpan Bukti Dukung'}
              </button>
            </form>
          </div>
        </div>
        
        <div className="lg:col-span-5">
          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 h-full max-h-[850px] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
              <Clock className="text-slate-500" size={20} /> Riwayat Input (Seluruhnya)
            </h2>
            <div className="space-y-4">
              {activities.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm italic">Belum ada riwayat kegiatan.</div>
              ) : (
                activities.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(act => {
                  const rhk = rhkList.find(r => r.id === act.rhkId);
                  const photosToShow = act.driveFileIds && act.driveFileIds.length > 0 ? act.driveFileIds : (act.photoUrls && act.photoUrls.length > 0 ? act.photoUrls : (act.photoUrl ? [act.photoUrl] : []));
                  const totalPhotos = photosToShow.length;

                  return (
                    <div key={act.id} className={`p-5 rounded-2xl shadow-sm border relative group transition-all hover:shadow-md ${act.isCompleted ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-100 hover:border-indigo-200'}`}>
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-slate-100 shadow-sm z-10">
                         <button onClick={()=>{
                           setEditingId(act.id);
                           setRealisasi(act.realisasi || '');
                           setDate(act.date);
                           if(act.endDate) { setIsMultiDay(true); setEndDate(act.endDate); } 
                           else { setIsMultiDay(false); setEndDate(''); }
                           setTime(act.time);
                           setSelectedRhkIds([act.rhkId]);
                           setDescription(act.description);
                           setIsCompleted(act.isCompleted || false); // Load status selesai
                           setAddToGCal(false);
                           setPhotoUrls([]); 
                           const legacyPhotos = act.photoUrls && act.photoUrls.length > 0 ? act.photoUrls : (act.photoUrl ? [act.photoUrl] : []);
                           setExistingDriveIds(act.driveFileIds && act.driveFileIds.length > 0 ? act.driveFileIds : legacyPhotos);
                         }} className="p-1.5 hover:bg-amber-50 rounded-md transition-colors"><Edit size={16} className="text-amber-500"/></button>
                         <button onClick={()=>confirmAction("Hapus kegiatan ini?", ()=>deleteDoc(doc(db, `users/${user.uid}/activities`, act.id)))} className="p-1.5 hover:bg-red-50 rounded-md transition-colors"><Trash2 size={16} className="text-red-500"/></button>
                      </div>
                      
                      <div className="flex justify-between items-start mb-2.5 pr-14">
                        {/* 👇 TANGGAL MENGGUNAKAN HELPER BARU */}
                        <div className="text-[12px] font-bold text-indigo-600 flex items-center gap-1.5 bg-indigo-50/80 w-fit px-2 py-1 rounded-md">
                          <CalendarIcon size={12}/>
                          {formatCustomDateRange(act.date, act.endDate)} • {act.time}
                        </div>
                        {/* 👇 BADGE SELESAI */}
                        {act.isCompleted && (
                          <div className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                            ✅ Selesai
                          </div>
                        )}
                      </div>
                      
                      <h4 className="text-sm font-bold text-slate-700 mb-3 leading-snug">
                        RHK: {rhk?.title || 'RHK Dihapus'}
                      </h4>
                      <hr className="border-slate-100 mb-3" />
                      <p className="text-sm text-slate-600 mb-4 leading-relaxed whitespace-pre-wrap">
                        {formatTextWithLinks(act.description)}
                      </p>
                      {totalPhotos > 0 && (
                        <div className="space-y-3">
                           <SmartImage source={photosToShow[0]} className="w-full h-44 object-cover rounded-xl border border-slate-100 shadow-sm" alt="Bukti Utama"/>
                           {totalPhotos > 1 && (
                              <button type="button" onClick={() => setViewingPhotos(photosToShow)} className="text-xs flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors border border-slate-200 shadow-sm">
                                 <Plus size={14} className="text-slate-400" /> Lihat {totalPhotos - 1} foto lainnya
                              </button>
                           )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {viewingPhotos && (
          <div className="fixed inset-0 bg-slate-900/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewingPhotos(null)}>
            <div className="bg-white p-6 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6 sticky top-0 bg-white/90 backdrop-blur-md py-2 z-10 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-800">Galeri Foto Bukti</h3>
                <button onClick={() => setViewingPhotos(null)} className="p-2 bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {viewingPhotos.map((sourceUrl, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-2 bg-slate-50 flex items-center justify-center">
                    <SmartImage source={sourceUrl} alt={`Bukti Modal ${i+1}`} className="w-full h-auto max-h-96 object-contain rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    );
  };

  // 5. REKAP
  const RekapView = () => {
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedRhkFilter, setSelectedRhkFilter] = useState('all');

    const monthKey = `${currentYear}-${selectedMonth}`;
    const targetedRhkIdsInSelectedMonth = monthlyTargets[monthKey] || [];
    const rhksToDisplayInFilter = rhkList.filter(rhk => targetedRhkIdsInSelectedMonth.includes(rhk.id));

    const filteredActivities = activities.filter(act => {
      const d = new Date(act.date);
      const isSameMonthYear = d.getFullYear() === currentYear && (d.getMonth() + 1) === selectedMonth;
      const isMatchingRhk = selectedRhkFilter === 'all' ? true : act.rhkId === selectedRhkFilter;
      return isSameMonthYear && isMatchingRhk;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    const groupedActivities = filteredActivities.reduce((acc, act) => {
        if (!acc[act.rhkId]) acc[act.rhkId] = [];
        acc[act.rhkId].push(act);
        return acc;
    }, {});

    const activeRhkLabel = selectedRhkFilter === 'all' ? 'Semua RHK' : rhkList.find(r => r.id === selectedRhkFilter)?.title;

    const generatePDF = () => {
      const element = document.getElementById('print-area');
      const opt = { 
        margin: [15,15,15,15], 
        filename: `Rekap_${activeRhkLabel}_${getMonthName(selectedMonth)}_${currentYear}.pdf`, 
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
      };
      window.html2pdf().set(opt).from(element).save();
    };

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border animate-in fade-in duration-500">
        <div className="flex justify-between items-center mb-8 print:hidden border-b pb-4">
           <div>
             <h2 className="text-2xl font-bold text-slate-800">Rekap & Unduh</h2>
             <p className="text-sm text-slate-500">Siapkan dokumen laporan bukti dukung Anda.</p>
           </div>
           <button onClick={generatePDF} className="bg-indigo-600 hover:bg-indigo-700 transition-all text-white px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-md">
             <Printer size={20}/> Download PDF
           </button>
        </div>
        
        <div className="bg-slate-50 p-6 rounded-2xl mb-8 print:hidden border border-slate-100">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FolderOpen size={16} /> Konfigurasi Laporan
          </h3>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">
              Bulan: {getMonthName(selectedMonth)} {currentYear}
            </div>
            <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold">
              Kategori: {activeRhkLabel}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 ml-1">Pilih Periode</label>
              <select 
                value={selectedMonth} 
                onChange={e => {
                  setSelectedMonth(Number(e.target.value));
                  setSelectedRhkFilter('all'); 
                }} 
                className="w-full px-4 py-2.5 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                 {[...Array(12)].map((_, i) => (
                   <option key={i+1} value={i+1}>{getMonthName(i+1)} {currentYear}</option>
                 ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 ml-1">Filter Kategori RHK</label>
              <select value={selectedRhkFilter} onChange={e=>setSelectedRhkFilter(e.target.value)} className="w-full px-4 py-2.5 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="all">Tampilkan Semua RHK</option>
                {rhksToDisplayInFilter.map(rhk => (
                  <option key={rhk.id} value={rhk.id}>{rhk.title}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div id="print-area" className="print-area pb-4">
           <div className="text-center border-b-4 border-double border-slate-300 pb-6 mb-8">
             <h1 className="text-2xl font-bold text-slate-900 uppercase">Laporan Bukti Dukung Kegiatan</h1>
             <p className="text-slate-600 mt-1 font-medium">Bulan: {getMonthName(selectedMonth)} {currentYear}</p>
           </div>
           
           {Object.keys(groupedActivities).length === 0 ? (
             <div className="text-center py-20">
               <p className="text-slate-400 italic">Data tidak ditemukan untuk periode dan kategori ini.</p>
             </div>
           ) : (
             Object.entries(groupedActivities).map(([rhkId, acts]) => {
                const rhk = rhkList.find(r => r.id === rhkId);
                const totalRealisasi = acts.reduce((sum, act) => sum + (Number(act.realisasi) || 0), 0);
                
                return (
                  <div key={rhkId} className="mb-10 break-inside-avoid">
                     <div className="bg-indigo-50/80 p-4 rounded-lg mb-6 border border-indigo-100 flex items-start gap-3">
                       <Target size={20} className="shrink-0 mt-0.5 text-indigo-600" />
                       <div className="flex-1">
                         <p className="text-[10px] uppercase font-bold text-indigo-500 mb-1">RHK Pimpinan: {rhk?.pimpinanRhk || '-'}</p>
                         <h4 className="text-sm font-bold text-indigo-900 leading-snug mb-2">{rhk?.title || 'RHK Dihapus'}</h4>
                         
                         {/* 👇 INI BADGE CAPAIANNYA */}
                         {totalRealisasi > 0 && (
                           <div className="inline-flex items-center gap-1.5 bg-white border border-indigo-200 text-indigo-800 text-xs font-bold px-3 py-1.5 rounded-md shadow-sm">
                             📊 Capaian Bulan Ini: {totalRealisasi} <span className="text-indigo-400 font-medium">/ Target Tahunan: {rhk?.targetCount || '-'}</span>
                           </div>
                         )}
                       </div>
                     </div>
                     
                     <div className="flex flex-col gap-6">
                       {acts.map(act => {
                         const photosToShow = act.driveFileIds && act.driveFileIds.length > 0 ? act.driveFileIds : (act.photoUrls && act.photoUrls.length > 0 ? act.photoUrls : (act.photoUrl ? [act.photoUrl] : []));
                         let gridClass = "grid-cols-1 w-full md:w-1/2"; 
                         if (photosToShow.length === 2) gridClass = "grid-cols-2";
                         else if (photosToShow.length >= 3) gridClass = "grid-cols-3";

                         return (
                           <div key={act.id} className="border border-slate-200 p-6 rounded-xl flex flex-col bg-white break-inside-avoid">
                             
                             <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-2">
                               <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
                                 <CalendarIcon size={14} className="shrink-0"/> 
                                 <span>{formatCustomDateRange(act.date, act.endDate)} • {act.time}</span>
                               </div>
                               {act.isCompleted && (
                                 <div className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                                   ✅ Selesai
                                 </div>
                               )}
                             </div>

                             {photosToShow.length > 0 ? (
                               <div className={`grid gap-4 mb-5 ${gridClass}`}>
                                 {photosToShow.map((sourceUrl, pIdx) => (
                                    <SmartImage key={pIdx} source={sourceUrl} className="w-full h-56 object-contain bg-slate-50 rounded-lg border border-slate-200 shadow-sm" alt={`Bukti ${pIdx + 1}`} />
                                 ))}
                               </div>
                             ) : (
                               <div className="h-32 bg-slate-50 flex items-center justify-center text-slate-300 rounded-lg mb-4 border border-dashed italic text-xs">Tanpa Foto Bukti</div>
                             )}

                             <p className="text-sm text-slate-800 leading-relaxed font-medium whitespace-pre-wrap">{formatTextWithLinks(act.description)}</p>
                           </div>
                         );
                       })}
                     </div>
                  </div>
                )
             })
           )}
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
            <img src="/logo1.jpeg" alt="Jurnal RHKku" className="h-20 object-contain" />
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
             <div className="flex flex-col">
               <div className="truncate text-sm font-bold text-slate-800">{user.displayName || user.email}</div>
               {isAdmin && <span className="text-[11px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 flex items-center gap-1">✨ Administrator</span>}
             </div>
             <button onClick={handleLogout} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Keluar"><LogOut size={18}/></button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 h-screen overflow-y-auto print:h-auto print:overflow-visible">
        <header className="lg:hidden p-4 bg-white border-b flex items-center justify-between print:hidden">
          <div className="flex items-center">
            <img src="/logo1.jpeg" alt="Jurnal RHKku" className="h-14 object-contain" />
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