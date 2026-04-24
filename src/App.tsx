import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  LayoutDashboard, 
  Package, 
  Clock, 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  LogOut, 
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock3,
  History,
  FileUp,
  ChevronRight,
  ArrowRight,
  Timer,
  Play,
  Edit2,
  Check,
  X,
  LayoutGrid,
  List,
  Columns,
  Download,
  ExternalLink,
  Building2,
  GripVertical
} from 'lucide-react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  type User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  setDoc,
  getDoc,
  doc, 
  serverTimestamp, 
  orderBy,
  where,
  getDocs,
  getDocFromServer,
  collectionGroup,
  writeBatch,
  deleteDoc,
  Timestamp,
  type DocumentData
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { cn } from './lib/utils';
import { format, differenceInMinutes, startOfDay, endOfDay, subDays, addDays } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';

const Resizer = ({ onMouseDown, isResizing }: { onMouseDown: (e: React.MouseEvent) => void, isResizing: boolean }) => (
  <div 
    onMouseDown={onMouseDown}
    className={cn(
      "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-blue/30 transition-colors z-20 group",
      isResizing && "bg-brand-blue w-0.5"
    )}
  >
    <div className="absolute top-0 bottom-0 -right-2 w-4 z-30" />
  </div>
);

// --- Helpers ---
const isDelayed = (plannedDate?: string, currentStatus?: string, targetStatuses: string[] = ['Approved']) => {
  if (!plannedDate) return false;
  const status = (currentStatus || '').toLowerCase();
  if (targetStatuses.some(ts => status.includes(ts.toLowerCase()))) return false;
  
  try {
    const planned = new Date(plannedDate);
    const now = new Date();
    planned.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    return now > planned;
  } catch (e) {
    return false;
  }
};

// --- Types ---
interface MaterialSubmittal {
  id: string;
  activityId?: string;
  division: string;
  boqRef: string;
  description: string;
  supplier: string;
  unit: string;
  quantity: number;
  location: string;
  status: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  nextAction: string;
  responsible: string;
  rev?: string;
  dateApproved?: string;
  boqAmount?: number;
  finishCode?: string;
  dateSubmitted?: string;
  mockupRequired?: string;
  irDwgRequired?: string; // 'REQUIRED' | 'NOT REQUIRED'
  irDwgStatus?: string;   // 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT SUBMITTED'
  irRef?: string;
  poStatus?: string;      // 'Issued' | 'not Issued' | 'Cash Issue' | 'waiting management approval'
  plannedMsDate?: string; // ISO date string
  plannedPoDate?: string; // ISO date string
  jobId?: string;
  createdAt: any;
  updatedAt: any;
  sortOrder?: number;
}

type UserRole = 'admin' | 'contractor' | 'consultant';

interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
  createdAt: any;
}

interface Job {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'on-hold';
}

interface AppPreference {
  appName: string;
  orgName: string;
  primaryColor?: string;
  updatedAt?: any;
}

interface TimeLog {
  id: string;
  userId: string;
  jobId: string;
  clockIn: any;
  clockOut: any;
  durationMinutes: number;
  notes: string;
}

interface HistoryItem {
  id: string;
  status: string;
  comment: string;
  updatedBy: string;
  timestamp: any;
}

// --- Components ---

const StatusPill = ({ status, size = 'default' }: { status: string; size?: 'default' | 'sm' }) => {
  const s = (status || '').toLowerCase();
  let colors = "bg-slate-100 text-slate-500 uppercase tracking-widest font-bold";
  
  if (s === 'not submitted') colors = "bg-[#FCEBEB] text-[#A32D2D]";
  else if (s === 'approved as noted' || s === 'approved w/ notes') colors = "bg-[#E1F5EE] text-[#0F6E56]";
  else if (s.includes('approved')) colors = "bg-[#EAF3DE] text-[#3B6D11]";
  else if (s.includes('rejected')) colors = "bg-[#FCEBEB] text-[#791F1F]";
  else if (s.includes('under review') || s.includes('review') || s.includes('pending')) colors = "bg-[#FAEEDA] text-[#854F0B]";
  else if (s === 'submitted') colors = "bg-[#E6F1FB] text-[#185FA5]";

  const displayStatus = (status || 'Unknown').toUpperCase();
  const sizeClasses = size === 'sm' ? "text-[8px] px-1 py-0 border-0" : "text-[9px] px-2 py-0.5";

  return (
    <span className={cn("status-pill", colors, sizeClasses)}>
      {displayStatus === 'NOT SUBMITTED' ? 'Not Sub' : displayStatus === 'APPROVED AS NOTED' ? 'Approved+' : displayStatus}
    </span>
  );
};

const PriorityBadge = ({ priority }: { priority: string }) => {
  const colors = {
    HIGH: "bg-[#E24B4A]",
    MEDIUM: "bg-[#EF9F27]",
    LOW: "bg-[#1D9E75]"
  };
  const p = priority || 'MEDIUM';
  return (
    <div className="flex items-center gap-1.5 grayscale-[0.2]">
      <span className={cn("w-2 h-2 rounded-full", colors[p as keyof typeof colors] || "bg-gray-400")} />
      <span className="text-[11px] font-medium text-slate-600">{p.charAt(0) + p.slice(1).toLowerCase()}</span>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<'dash' | 'tracker' | 'entry' | 'audit' | 'users' | 'projects' | 'prefs'>('dash');
  const [preferences, setPreferences] = useState<AppPreference>({
    appName: 'MATERIATRACK',
    orgName: 'Attijariwafa Bank Egypt HQ'
  });
  const [materials, setMaterials] = useState<MaterialSubmittal[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [dbError, setDbError] = useState<boolean>(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

  useEffect(() => {
    const checkConn = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setDbError(false);
      } catch (err) {
        console.error("Firestore connectivity check failed:", err);
        setDbError(true);
      }
    };
    checkConn();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        setPreferences(snap.data() as AppPreference);
      }
    }, (err) => {
      console.warn("Branding settings not loaded (expected if unauthenticated):", err.message);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch or create profile
        const profileRef = doc(db, 'users', u.uid);
        try {
          const snap = await getDoc(profileRef);
          if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
          } else {
            // Create default profile
            const newProfile: UserProfile = {
              userId: u.uid,
              email: u.email || '',
              displayName: u.displayName || 'User',
              role: (u.email === 'pola.refaat.g@gmail.com') ? 'admin' : 'contractor', // Grant initial admin to owner
              photoURL: u.photoURL || null, // Use null instead of undefined
              createdAt: serverTimestamp()
            };
            await setDoc(profileRef, newProfile);
            setProfile(newProfile);
            console.log("Profile created for new user:", u.email);
          }
        } catch (err) {
          console.error("Profile sync error details:", err);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Sync Data
  useEffect(() => {
    if (!user) return;

    let qMaterials = query(collection(db, 'materials'), orderBy('createdAt', 'desc'));
    if (selectedJob) {
      qMaterials = query(collection(db, 'materials'), where('jobId', '==', selectedJob.id), orderBy('createdAt', 'desc'));
    }

    const unsubMaterials = onSnapshot(qMaterials, (snap) => {
      setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialSubmittal)));
    }, (err) => {
      console.error("Materials sync error:", err);
    });

    const qJobs = query(collection(db, 'jobs'), where('status', '==', 'active'));
    const unsubJobs = onSnapshot(qJobs, (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
    });

    const qActiveLog = query(
      collection(db, 'timelogs'), 
      where('userId', '==', user.uid), 
      where('clockOut', '==', null)
    );
    const unsubActiveLog = onSnapshot(qActiveLog, (snap) => {
      if (!snap.empty) {
        setActiveLog({ id: snap.docs[0].id, ...snap.docs[0].data() } as TimeLog);
      } else {
        setActiveLog(null);
      }
    });

    const qLogs = query(collection(db, 'timelogs'), where('userId', '==', user.uid), orderBy('clockIn', 'desc'));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setTimeLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeLog)));
    });

    return () => {
      unsubMaterials();
      unsubJobs();
      unsubActiveLog();
      unsubLogs();
    };
  }, [user, selectedJob]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.error("Login Error:", err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500">INITIALIZING SYSTEMS...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-10 shadow-[0_4px_20px_rgba(0,0,0,0.05)] text-center">
        <div className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-6 text-brand-blue">
          <Package size={32} />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-800 mb-2 uppercase">{preferences.appName || 'MATERIATRACK'}</h1>
        <p className="text-sm text-slate-500 mb-8 font-medium">{preferences.orgName || 'Professional Submittal & Job Management System'}</p>
        <button 
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="w-full py-3 px-4 bg-brand-blue text-white rounded-lg font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoggingIn ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <UserIcon size={18} />
          )}
          {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* Topbar */}
      <header className="topbar">
        <div className="logo flex items-center gap-2">
          <span className="font-bold text-slate-900">{preferences.appName || 'MATERIATRACK'}</span>
          <span className="text-slate-400 font-normal">|</span>
          <span className="text-slate-500 text-[11px] font-medium uppercase tracking-wider">
            {selectedJob ? selectedJob.name : (preferences.orgName || 'Attijariwafa Bank Egypt HQ')}
          </span>
          {dbError && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-bold animate-pulse">
              <AlertCircle size={10} /> OFFLINE MODE
            </div>
          )}
        </div>

        <div className="tabs-container">
          <button 
            onClick={() => setActiveTab('dash')}
            className={cn("tab-btn", activeTab === 'dash' ? "tab-btn-active" : "tab-btn-inactive")}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('tracker')}
            className={cn("tab-btn", activeTab === 'tracker' ? "tab-btn-active" : "tab-btn-inactive")}
          >
            Tracker
          </button>
          <button 
            onClick={() => setActiveTab('entry')}
            className={cn("tab-btn", activeTab === 'entry' ? "tab-btn-active" : "tab-btn-inactive")}
          >
            Submit Entry
          </button>
          <button 
            onClick={() => setActiveTab('audit')}
            className={cn("tab-btn", activeTab === 'audit' ? "tab-btn-active" : "tab-btn-inactive")}
          >
            Audit Logs
          </button>
          {profile?.role === 'admin' && (
            <>
              <button 
                onClick={() => setActiveTab('projects')}
                className={cn("tab-btn", activeTab === 'projects' ? "tab-btn-active" : "tab-btn-inactive")}
              >
                Projects
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={cn("tab-btn", activeTab === 'users' ? "tab-btn-active" : "tab-btn-inactive")}
              >
                Users
              </button>
              <button 
                onClick={() => setActiveTab('prefs')}
                className={cn("tab-btn", activeTab === 'prefs' ? "tab-btn-active" : "tab-btn-inactive")}
              >
                Preferences
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          {selectedJob && (
            <div className="flex items-center gap-3 pr-4 border-r border-slate-100">
               <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-brand-blue uppercase tracking-widest leading-none mb-1">Active Project</span>
                  <span className="text-xs font-bold text-slate-800">{selectedJob.name}</span>
               </div>
               <button 
                onClick={() => setSelectedJob(null)}
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-brand-blue transition-colors"
                title="Switch Project"
               >
                 <Edit2 size={14} />
               </button>
            </div>
          )}
          <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-bold text-slate-800 leading-tight">{user.displayName}</span>
              <span className={cn(
                "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                profile?.role === 'admin' ? "bg-slate-800 text-white" :
                profile?.role === 'consultant' ? "bg-brand-blue text-white" :
                "bg-slate-100 text-slate-500"
              )}>
                {profile?.role || 'Guest'}
              </span>
            </div>
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-xl ring-2 ring-slate-100 shadow-sm" alt="p" />
          </div>
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative bg-white">
        {!selectedJob && activeTab !== 'projects' && activeTab !== 'users' ? (
          <ProjectSelectorView jobs={jobs} onSelect={setSelectedJob} />
        ) : (
          <>
            {activeTab === 'dash' && <DashboardView materials={materials} />}
            {activeTab === 'tracker' && (
              <TrackerView 
                materials={materials} 
                user={user} 
                selectedJob={selectedJob}
                selectedId={selectedMaterialId}
                onSelectId={setSelectedMaterialId}
              />
            )}
            {activeTab === 'entry' && <EntryView user={user} jobs={selectedJob ? [selectedJob] : jobs} onSuccess={() => setActiveTab('tracker')} />}
            {activeTab === 'audit' && <AuditLogView materials={materials} selectedJob={selectedJob} />}
            {activeTab === 'users' && profile?.role === 'admin' && <UserManagementView />}
            {activeTab === 'projects' && profile?.role === 'admin' && <ProjectManagementView />}
            {activeTab === 'prefs' && profile?.role === 'admin' && <PreferencesView preferences={preferences} user={user} />}
          </>
        )}
      </main>
    </div>
  );
}

// --- NEW AUDIT LOG VIEW COMPONENT ---
function AuditLogView({ materials, selectedJob }: { materials: MaterialSubmittal[]; selectedJob?: Job | null }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const materialMap = useMemo(() => {
    const map: Record<string, MaterialSubmittal> = {};
    materials.forEach(m => {
      map[m.id] = m;
    });
    return map;
  }, [materials]);

  useEffect(() => {
    const q = query(collectionGroup(db, 'auditLog'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(doc => ({ 
        id: doc.id, 
        materialId: doc.ref.path.split('/')[1],
        ...doc.data() 
      })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const mat = materialMap[log.materialId];
      if (!mat) return false; // Filter out logs that don't belong to a material in the current scope (project)

      const term = search.toLowerCase();
      
      const matchSearch = 
        (log.updatedBy || '').toLowerCase().includes(term) ||
        (mat?.description || '').toLowerCase().includes(term) ||
        (mat?.boqRef || '').toLowerCase().includes(term) ||
        (mat?.division || '').toLowerCase().includes(term) ||
        (mat?.activityId || '').toLowerCase().includes(term) ||
        (log.changes || []).some((c: any) => 
          (c.field || '').toLowerCase().includes(term) ||
          (c.oldValue || '').toString().toLowerCase().includes(term) ||
          (c.newValue || '').toString().toLowerCase().includes(term)
        );

      let matchDate = true;
      if (startDate || endDate) {
        const logDateStr = log.timestamp?.toDate ? format(log.timestamp.toDate(), 'yyyy-MM-dd') : '';
        if (logDateStr) {
          if (startDate && logDateStr < startDate) matchDate = false;
          if (endDate && logDateStr > endDate) matchDate = false;
        } else {
          matchDate = false;
        }
      }

      return matchSearch && matchDate;
    });
  }, [logs, search, startDate, endDate, materialMap]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">
            Audit Trail {selectedJob && <span className="text-brand-blue"> - {selectedJob.name}</span>}
          </h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
            {selectedJob ? "Viewing changes for this project only" : "Viewing all changes globally"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
           <div className="relative sm:w-80 flex-shrink-0">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
             <input 
               type="text" 
               placeholder="Search by user, description, or changes..." 
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all shadow-sm"
             />
           </div>
           
           <div className="flex items-center gap-2">
             <input 
               type="date"
               value={startDate}
               onChange={(e) => setStartDate(e.target.value)}
               className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none"
             />
             <span className="text-slate-400 text-xs">-</span>
             <input 
               type="date"
               value={endDate}
               onChange={(e) => setEndDate(e.target.value)}
               className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none"
             />
           </div>

           <span className="text-xs bg-brand-blue/10 text-brand-blue font-bold px-3 py-2 rounded-lg uppercase tracking-widest">{filteredLogs.length} Records</span>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4 font-bold">Date / Time</th>
                <th className="px-6 py-4 font-bold">Act. ID</th>
                <th className="px-6 py-4 font-bold">Div.</th>
                <th className="px-6 py-4 font-bold">BOQ Ref.</th>
                <th className="px-6 py-4 font-bold">Description</th>
                <th className="px-6 py-4 font-bold">User</th>
                <th className="px-6 py-4 font-bold">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">Loading audit logs...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">No logs found matching filters.</td></tr>
              ) : (
                filteredLogs.map(log => {
                  const ts = log.timestamp?.toDate ? format(log.timestamp.toDate(), 'PPpp') : '-';
                  const mat = materialMap[log.materialId];
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono text-[10px]">{ts}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-800">{mat?.activityId || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-700">{mat?.division || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-600">{mat?.boqRef || '-'}</td>
                      <td className="px-6 py-4 min-w-[200px] text-slate-600 truncate max-w-xs">{mat?.description || <span className="italic text-slate-300">Deleted Material</span>}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-800">{log.updatedBy}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {log.changes && Array.isArray(log.changes) ? (
                          <div className="space-y-1">
                            {log.changes.map((c: any, i: number) => (
                              <div key={i} className="flex gap-2">
                                <span className="font-bold text-slate-500 text-[9px] uppercase tracking-wide w-20 shrink-0">{c.field}</span>
                                <span className="text-[11px]">
                                  <span className="line-through opacity-60 mr-1">{c.oldValue}</span>
                                  <span>→</span>
                                  <span className="text-brand-blue font-semibold ml-1">{c.newValue}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="italic text-slate-400">System update</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
// --- END AUDIT LOG VIEW COMPONENT ---

function UserManagementView() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data() } as UserProfile)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const updateRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (err) {
      console.error("Failed to update role:", err);
      alert("Permission denied or update failed.");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">User Management</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Assign roles and manage system access permissions.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-blue/10 text-brand-blue rounded-lg text-[10px] font-bold uppercase tracking-widest">
          {users.length} Active Users
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4 font-bold">User</th>
                <th className="px-6 py-4 font-bold">Email</th>
                <th className="px-6 py-4 font-bold">Current Role</th>
                <th className="px-6 py-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">Loading user registry...</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.userId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName)}`} className="w-8 h-8 rounded-lg shadow-sm" alt="" />
                        <span className="font-bold text-slate-800">{u.displayName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-500">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                        u.role === 'admin' ? "bg-slate-800 text-white" :
                        u.role === 'consultant' ? "bg-brand-blue text-white" :
                        "bg-slate-100 text-slate-500"
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <select 
                          value={u.role}
                          onChange={(e) => updateRole(u.userId, e.target.value as UserRole)}
                          className="bg-slate-100 border-none text-[10px] font-bold uppercase tracking-wider rounded-lg px-2 py-1 outline-none hover:bg-slate-200 transition-colors cursor-pointer"
                        >
                          <option value="contractor">Contractor</option>
                          <option value="consultant">Consultant</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProjectSelectorView({ jobs, onSelect }: { jobs: Job[]; onSelect: (job: Job) => void }) {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-12 bg-slate-50 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="max-w-4xl w-full space-y-10">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Select Active Project</h2>
          <p className="text-sm text-slate-500 font-medium">Please choose a project to access its specific dashboard and tracking data.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white border border-slate-200 rounded-3xl p-12 shadow-sm">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <Building2 size={32} />
                </div>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No active projects found</p>
                <p className="text-xs text-slate-500 mt-2">Please contact an administrator to categorize your workspace.</p>
            </div>
          ) : (
            jobs.map(job => (
              <button 
                key={job.id}
                onClick={() => onSelect(job)}
                className="group relative bg-white border border-slate-200 rounded-3xl p-8 text-left hover:border-brand-blue hover:shadow-xl hover:shadow-brand-blue/5 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-blue/5 rounded-full -mr-16 -mt-16 group-hover:bg-brand-blue/10 transition-colors" />
                
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-6 text-slate-400 group-hover:bg-brand-blue group-hover:text-white transition-all duration-300">
                   <Building2 size={24} />
                </div>
                
                <h3 className="text-lg font-black text-slate-800 mb-2 group-hover:text-brand-blue transition-colors">{job.name}</h3>
                <p className="text-[11px] text-slate-400 font-medium line-clamp-2 leading-relaxed mb-6 h-8">{job.description || 'Access project tracker, submittals, and analytics registry.'}</p>
                
                <div className="flex items-center gap-2 text-brand-blue font-black text-[10px] uppercase tracking-widest opacity-80 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                  <span>Enter Workspace</span>
                  <ArrowRight size={14} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectManagementView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStatus, setNewStatus] = useState<'active' | 'completed' | 'on-hold'>('active');

  useEffect(() => {
    const q = query(collection(db, 'jobs'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const jobData = {
      name: newName,
      description: newDesc,
      status: newStatus,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingJob) {
        await updateDoc(doc(db, 'jobs', editingJob.id), jobData);
      } else {
        await addDoc(collection(db, 'jobs'), {
          ...jobData,
          createdAt: serverTimestamp()
        });
      }
      setIsAdding(false);
      setEditingJob(null);
      resetForm();
    } catch (err) {
      console.error("Project Save Error:", err);
      alert("Failed to save project. Ensure you have admin permissions.");
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewDesc('');
    setNewStatus('active');
  };

  const startEdit = (job: Job) => {
    setEditingJob(job);
    setNewName(job.name);
    setNewDesc(job.description);
    setNewStatus(job.status);
    setIsAdding(true);
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Project Management</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Create and manage construction projects and their lifecycles.</p>
        </div>
        <button 
          onClick={() => { setIsAdding(true); setEditingJob(null); resetForm(); }}
          className="px-4 py-2 bg-brand-blue text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md active:scale-95"
        >
          <Plus size={16} />
          ADD PROJECT
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-20 text-center text-slate-400 font-medium">Loading projects...</div>
        ) : jobs.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-400 font-medium bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            No projects found. Use the button above to create one.
          </div>
        ) : (
          jobs.map(job => (
            <div key={job.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 rounded-lg bg-brand-blue/10 flex items-center justify-center text-brand-blue">
                  <Building2 size={20} />
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                  job.status === 'active' ? "bg-emerald-100 text-emerald-700" :
                  job.status === 'completed' ? "bg-slate-100 text-slate-500" :
                  "bg-amber-100 text-amber-700"
                )}>
                  {job.status}
                </span>
              </div>
              <h3 className="font-bold text-slate-800 text-sm mb-1">{job.name}</h3>
              <p className="text-xs text-slate-500 line-clamp-2 mb-4 h-8">{job.description || 'No description provided.'}</p>
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: {job.id.slice(0, 6)}</span>
                <button 
                  onClick={() => startEdit(job)}
                  className="text-brand-blue hover:text-blue-700 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1"
                >
                  <Edit2 size={12} />
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 tracking-tight">{editingJob ? 'Edit Project' : 'Add New Project'}</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Name</label>
                <input 
                  type="text" 
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g., Downtown Commercial Tower"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
                <select 
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20"
                >
                  <option value="active">Active</option>
                  <option value="on-hold">On-Hold</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                <textarea 
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Enter project scope or site details..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20 min-h-[100px] resize-none"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all font-sans"
                >
                  CANCEL
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-brand-blue/20 font-sans"
                >
                  {editingJob ? 'UPDATE PROJECT' : 'SAVE PROJECT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PreferencesView({ preferences, user }: { preferences: AppPreference; user: any }) {
  const [appName, setAppName] = useState(preferences.appName);
  const [orgName, setOrgName] = useState(preferences.orgName);
  const [isSaving, setIsSaving] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  useEffect(() => {
    setAppName(preferences.appName);
    setOrgName(preferences.orgName);
  }, [preferences]);

  const handleWipeAllData = async () => {
    const confirm1 = window.confirm("CRITICAL WARNING: This will permanently delete ALL materials, projects, time logs, and other user profiles. This action cannot be undone. Are you absolutely sure?");
    if (!confirm1) return;
    
    const confirm2 = window.confirm("SECOND CONFIRMATION: Are you REALLY sure you want to delete everything? Your own profile and settings will be preserved, but everything else goes. CONTINUE?");
    if (!confirm2) return;

    setIsWiping(true);
    try {
      // 1. Materials & Subcollections
      const matSnap = await getDocs(collection(db, 'materials'));
      for (const matDoc of matSnap.docs) {
        // Collect subcollections (history and auditLog)
        const histSnap = await getDocs(collection(db, 'materials', matDoc.id, 'history'));
        for (const hDoc of histSnap.docs) await deleteDoc(hDoc.ref);
        
        const auditSnap = await getDocs(collection(db, 'materials', matDoc.id, 'auditLog'));
        for (const aDoc of auditSnap.docs) await deleteDoc(aDoc.ref);
        
        await deleteDoc(matDoc.ref);
      }
      
      // 2. Jobs
      const jobSnap = await getDocs(collection(db, 'jobs'));
      for (const jobDoc of jobSnap.docs) await deleteDoc(jobDoc.ref);
      
      // 3. Time logs
      const logSnap = await getDocs(collection(db, 'timelogs'));
      for (const logDoc of logSnap.docs) await deleteDoc(logDoc.ref);

      // 4. Users (except current)
      const userSnap = await getDocs(collection(db, 'users'));
      for (const uDoc of userSnap.docs) {
        if (uDoc.id !== user.uid) await deleteDoc(uDoc.ref);
      }

      // 5. Reset Branding
      await setDoc(doc(db, 'settings', 'global'), {
        appName: 'MATERIATRACK',
        orgName: 'New Organization',
        updatedAt: serverTimestamp()
      });
      
      alert("Application data wiped successfully. Branding reset to defaults.");
      window.location.reload(); // Refresh to clear local states
    } catch (err) {
      console.error("Wipe Error:", err);
      alert("Failed to wipe data. You may not have sufficient permissions to delete certain records.");
    } finally {
      setIsWiping(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        appName: appName.trim(),
        orgName: orgName.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Preferences saved successfully! All users will see the changes.");
    } catch (err) {
      console.error("Save Preference Error:", err);
      alert("Failed to save preferences. Check console for details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">Application Preferences</h2>
        <p className="text-xs text-slate-500 font-medium mt-1">Configure global branding and interface settings.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center text-white">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Interface Branding</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">General Settings</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Application Name</label>
            <input 
              type="text" 
              required
              value={appName}
              onChange={e => setAppName(e.target.value)}
              placeholder="e.g., MATERIATRACK"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20 font-bold"
            />
            <p className="text-[9px] text-slate-400">This replaces the main logo text throughout the application.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization / Client Name</label>
            <input 
              type="text" 
              required
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="e.g., Attijariwafa Bank Egypt HQ"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20 font-medium"
            />
            <p className="text-[9px] text-slate-400">This name appears in the top header and login subtitles.</p>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={isSaving}
              className="w-full py-4 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-brand-blue/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {isSaving ? 'SAVING CHANGES...' : 'SAVE APPLICATION PREFERENCES'}
            </button>
          </div>
        </form>
      </div>

      <div className="p-6 rounded-2xl bg-slate-800 text-white space-y-3">
         <div className="flex items-center gap-2 text-brand-blue">
            <AlertCircle size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Admin Notice</span>
         </div>
         <p className="text-[11px] font-medium leading-relaxed opacity-80">
           Changes made here are applied globally in real-time. All authenticated users will see the updated branding upon their next session or page refresh.
         </p>
      </div>

      <div className="p-6 rounded-2xl border-2 border-rose-100 bg-rose-50/30 space-y-4">
          <div className="flex items-center gap-2 text-rose-600">
             <AlertTriangle size={18} />
             <span className="text-[10px] font-black uppercase tracking-widest">Danger Zone</span>
          </div>
          <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
            Wiping all data will clear the material tracking log, project list, and time sheets. This is irreversible.
          </p>
          <button 
            disabled={isWiping}
            onClick={handleWipeAllData}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-rose-700 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isWiping ? 'WIPING DATABASE...' : 'Wipe All Data'}
          </button>
      </div>
    </div>
  );
}

function EntryView({ user, jobs, onSuccess }: { user: any; jobs: Job[]; onSuccess: () => void }) {
  return (
    <div className="h-full overflow-y-auto p-12 bg-slate-50">
      <div className="max-w-xl mx-auto shadow-sm">
        <AddMaterialModal user={user} jobs={jobs} onClose={onSuccess} isView />
      </div>
    </div>
  );
}

function DashboardView({ materials }: { materials: MaterialSubmittal[] }) {
  const stats = useMemo(() => {
    const total = materials.length;
    const notSub = materials.filter(m => (m.status || '').toUpperCase() === 'NOT SUBMITTED').length;
    const approved = materials.filter(m => (m.status || '').toUpperCase().includes('APPROVED')).length;
    const rejected = materials.filter(m => (m.status || '').toUpperCase().includes('REJECTED')).length;
    const inProgress = materials.filter(m => {
      const s = (m.status || '').toLowerCase();
      return s === 'under review' || s === 'submitted';
    }).length;
    const highPrio = materials.filter(m => m.priority === 'HIGH').length;
    const medPrio = materials.filter(m => m.priority === 'MEDIUM').length;
    const lowPrio = materials.filter(m => m.priority === 'LOW').length;

    return { total, notSub, approved, rejected, inProgress, highPrio, medPrio, lowPrio };
  }, [materials]);

  const divData = useMemo(() => {
    const map: Record<string, { 
      name: string; total: number; approved: number; inProgress: number; notSub: number; rejected: number 
    }> = {};
    
    materials.forEach(m => {
      const divName = m.division || 'Unassigned';
      if (!map[divName]) {
        map[divName] = { name: divName, total: 0, approved: 0, inProgress: 0, notSub: 0, rejected: 0 };
      }
      const s = (m.status || '').toUpperCase();
      map[divName].total++;
      if (s.includes('APPROVED')) map[divName].approved++;
      else if (s.includes('REJECTED')) map[divName].rejected++;
      else if (s === 'NOT SUBMITTED') map[divName].notSub++;
      else if (s === 'UNDER REVIEW' || s === 'SUBMITTED') map[divName].inProgress++;
    });

    return Object.values(map).sort((a,b) => b.total - a.total);
  }, [materials]);

  const priorityPieData = [
    { name: 'High', value: stats.highPrio, color: '#E24B4A' },
    { name: 'Medium', value: stats.medPrio, color: '#EF9F27' },
    { name: 'Low', value: stats.lowPrio, color: '#1D9E75' }
  ];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-8 bg-white">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="kpi-card">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Items</span>
          <span className="text-2xl font-semibold text-slate-800">{stats.total}</span>
        </div>
        <div className="kpi-card">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Not Submitted</span>
          <span className="text-2xl font-semibold text-[#E24B4A]">{stats.notSub}</span>
        </div>
        <div className="kpi-card">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">In Progress</span>
          <span className="text-2xl font-semibold text-[#BA7517]">{stats.inProgress}</span>
        </div>
        <div className="kpi-card">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Approved</span>
          <span className="text-2xl font-semibold text-[#1D9E75]">{stats.approved}</span>
        </div>
        <div className="kpi-card">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Rejected</span>
          <span className="text-2xl font-semibold text-[#A32D2D]">{stats.rejected}</span>
        </div>
        <div className="kpi-card">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">High Priority</span>
          <span className="text-2xl font-semibold text-[#BA7517]">{stats.highPrio}</span>
        </div>
      </div>

      {/* Charts Section */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status Breakdown by Division</h3>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={divData.slice(0, 12)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} hide />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }}
              />
              <Bar dataKey="approved" stackId="a" fill="#1D9E75" radius={[0, 0, 0, 0]} name="Approved" />
              <Bar dataKey="inProgress" stackId="a" fill="#EF9F27" radius={[0, 0, 0, 0]} name="In Progress" />
              <Bar dataKey="notSub" stackId="a" fill="#e2e0d8" radius={[0, 0, 0, 0]} name="Not Submitted" />
              <Bar dataKey="rejected" stackId="a" fill="#E24B4A" radius={[2, 2, 0, 0]} name="Rejected" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Division Table */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Division Detail</h3>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="text-left px-4 py-2 font-medium">Division</th>
                <th className="text-left px-4 py-2 font-medium">Total</th>
                <th className="text-left px-4 py-2 font-medium">Approved</th>
                <th className="text-left px-4 py-2 font-medium">In Progress</th>
                <th className="text-left px-4 py-2 font-medium">Not Sub.</th>
                <th className="text-left px-4 py-2 font-medium">Rejected</th>
                <th className="text-left px-4 py-2 font-medium">Approval Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {divData.map((d, i) => {
                const rate = d.total > 0 ? Math.round((d.approved / d.total) * 100) : 0;
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2 text-slate-800 font-medium">{d.name}</td>
                    <td className="px-4 py-2 text-slate-600">{d.total}</td>
                    <td className="px-4 py-2 text-[#1D9E75] font-semibold">{d.approved}</td>
                    <td className="px-4 py-2 text-[#BA7517] font-semibold">{d.inProgress}</td>
                    <td className="px-4 py-2 text-slate-400">{d.notSub}</td>
                    <td className="px-4 py-2 text-[#A32D2D] font-semibold">{d.rejected}</td>
                    <td className="px-4 py-2 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 min-w-[32px]">{rate}%</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full transition-all duration-1000", rate >= 60 ? "bg-[#1D9E75]" : "bg-[#EF9F27]")} 
                            style={{ width: `${rate}%` }} 
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Priority Distribution */}
      <div className="space-y-4 pt-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Priority Distribution</h3>
        <div className="h-[160px] flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={priorityPieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={0}
                dataKey="value"
                stroke="none"
              >
                {priorityPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-6 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {priorityPieData.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
              <span>{d.name} {d.value} ({Math.round(d.value / (stats.total || 1) * 100)}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
    slate: "text-slate-600 bg-slate-50 border-slate-100",
    rose: "text-rose-600 bg-rose-50 border-rose-100"
  };

  return (
    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4 border", colors[color])}>
        {icon}
      </div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest leading-none mb-2">{label}</p>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

const TRACKER_COLUMNS = [
  { id: 'activityId', label: 'Activity ID' },
  { id: 'boqRef', label: 'BOQ Ref' },
  { id: 'division', label: 'Division' },
  { id: 'description', label: 'Description' },
  { id: 'responsible', label: 'Responsible' },
  { id: 'plannedMsDate', label: 'Planned MS' },
  { id: 'status', label: 'MS Status' },
  { id: 'irDwgStatus', label: 'mockup/sample/DWG' },
  { id: 'plannedPoDate', label: 'Planned PO' },
  { id: 'poStatus', label: 'PO Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'nextAction', label: 'Next Action' }
];

function TrackerView({ materials, user, selectedJob, selectedId, onSelectId }: { materials: MaterialSubmittal[]; user: any; selectedJob?: Job | null; selectedId?: string | null; onSelectId?: (id: string | null) => void }) {
  const [search, setSearch] = useState('');
  const [filterDiv, setFilterDiv] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPrio, setFilterPrio] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedItem, setSelectedItemState] = useState<MaterialSubmittal | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId) {
      const item = materials.find(m => m.id === selectedId);
      if (item) setSelectedItemState(item);
    }
  }, [selectedId, materials]);

  const setSelectedItem = (item: MaterialSubmittal | null) => {
    setSelectedItemState(item);
    if (onSelectId) onSelectId(item?.id || null);
  };

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [showUpcoming7Days, setShowUpcoming7Days] = useState(false);
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('trackerColumnWidths');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      selection: 40,
      activityId: 110,
      boqRef: 100,
      division: 80,
      description: 280,
      responsible: 130,
      plannedMsDate: 110,
      status: 120,
      irDwgStatus: 160,
      plannedPoDate: 110,
      poStatus: 120,
      priority: 90,
      nextAction: 160,
      actions: 70
    };
  });
  const [resizing, setResizing] = useState<{ id: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('trackerColumnWidths', JSON.stringify(columnWidths));
  }, [columnWidths]);

  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({
      id,
      startX: e.clientX,
      startWidth: columnWidths[id] || 100
    });
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizing.startX;
      const newWidth = Math.max(50, resizing.startWidth + deltaX);
      setColumnWidths(prev => ({
        ...prev,
        [resizing.id]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('trackerVisibleColumns');
      if (saved) return new Set(JSON.parse(saved));
    } catch (e) {}
    return new Set(TRACKER_COLUMNS.map(c => c.id));
  });

  useEffect(() => {
    localStorage.setItem('trackerVisibleColumns', JSON.stringify(Array.from(visibleColumns)));
  }, [visibleColumns]);

  const toggleColumn = (id: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = (materials || []).filter(m => {
      const desc = (m.description || '').toLowerCase();
      const div = (m.division || '').toLowerCase();
      const supp = (m.supplier || '').toLowerCase();
      const boq = (m.boqRef || '').toLowerCase();
      const iref = (m.irRef || '').toLowerCase();
      const actId = (m.activityId || '').toLowerCase();
      const responsible = (m.responsible || '').toLowerCase();
      const nextAction = (m.nextAction || '').toLowerCase();
      const term = (search || '').toLowerCase();

      const matchSearch = desc.includes(term) || 
                          div.includes(term) ||
                          supp.includes(term) ||
                          boq.includes(term) ||
                          iref.includes(term) ||
                          actId.includes(term) ||
                          responsible.includes(term) ||
                          nextAction.includes(term);

      const matchDiv = filterDiv ? m.division === filterDiv : true;
      const mStatus = (m.status || '').toUpperCase();
      const fStatus = (filterStatus || '').toUpperCase();
      const matchStatus = filterStatus ? mStatus.includes(fStatus) : true;
      const matchPrio = filterPrio ? m.priority === filterPrio : true;

      let matchDate = true;
      if (startDate || endDate) {
        const itemDateStr = m.updatedAt?.toDate ? format(m.updatedAt.toDate(), 'yyyy-MM-dd') : 
                           m.createdAt?.toDate ? format(m.createdAt.toDate(), 'yyyy-MM-dd') : '';
        if (startDate && (!itemDateStr || itemDateStr < startDate)) matchDate = false;
        if (endDate && (!itemDateStr || itemDateStr > endDate)) matchDate = false;
      }

      let matchUpcoming = true;
      if (showUpcoming7Days) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const nextWeekStr = format(addDays(new Date(), 7), 'yyyy-MM-dd');
        
        const msUpcoming = !!(m.plannedMsDate && m.plannedMsDate >= todayStr && m.plannedMsDate <= nextWeekStr);
        const poUpcoming = !!(m.plannedPoDate && m.plannedPoDate >= todayStr && m.plannedPoDate <= nextWeekStr);
        
        matchUpcoming = msUpcoming || poUpcoming;
      }

      let matchOnlyMine = true;
      if (showOnlyMine && user?.displayName) {
        const isResponsible = (m.responsible || '').toLowerCase().includes(user.displayName.toLowerCase());
        const isMentioned = (m as any).mentions?.some((name: string) => 
          name.toLowerCase() === user.displayName?.toLowerCase() || 
          user.email?.toLowerCase().includes(name.toLowerCase())
        );
        matchOnlyMine = isResponsible || !!isMentioned;
      }

      return matchSearch && matchDiv && matchStatus && matchPrio && matchDate && matchUpcoming && matchOnlyMine;
    });

    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = (a as any)[sortConfig.key];
        const bValue = (b as any)[sortConfig.key];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default / Custom Sort order
      result.sort((a, b) => {
        const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        
        // Secondary sort by title/description then createdAt
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    }

    return result;
  }, [materials, search, filterDiv, filterStatus, filterPrio, sortConfig, startDate, endDate, showUpcoming7Days, showOnlyMine, user]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (sortConfig) return; // Disable reorder when sorted by column
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    if (sortConfig) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;

    const items = [...filtered];
    const draggedIdx = items.findIndex(i => i.id === draggedId);
    if (draggedIdx === -1) return;

    const targetIdx = items.findIndex(i => i.id === targetId);
    if (targetIdx === -1) return;

    const [draggedItem] = items.splice(draggedIdx, 1);
    items.splice(targetIdx, 0, draggedItem);

    // Calculate new sortOrder
    let newOrder: number;
    const prev = items[targetIdx - 1];
    const next = items[targetIdx + 1];

    if (!prev && !next) {
      newOrder = 1000;
    } else if (!prev) {
      newOrder = (next.sortOrder ?? 0) - 1024;
    } else if (!next) {
      newOrder = (prev.sortOrder ?? 0) + 1024;
    } else {
      newOrder = ((prev.sortOrder ?? 0) + (next.sortOrder ?? 0)) / 2;
    }

    try {
      await updateDoc(doc(db, 'materials', draggedId), {
        sortOrder: newOrder,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Shift Sort Error:", err);
    }
    setDraggedItemId(null);
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const divisions = Array.from(new Set((materials || []).map(m => m.division))).sort();

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filtered.map(m => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const executeBulkUpdate = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    
    // Using batch for bulk updates
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
      const ref = doc(db, 'materials', id);
      batch.update(ref, { 
        status: bulkStatus,
        updatedAt: serverTimestamp() 
      });
      // Add audit log
      const auditRef = doc(collection(db, 'materials', id, 'auditLog'));
      batch.set(auditRef, {
        timestamp: serverTimestamp(),
        updatedBy: user.displayName || user.email,
        changes: [{ field: 'status', newValue: bulkStatus, oldValue: 'Multiple' }]
      });
    });

    try {
      await batch.commit();
      setShowBulkDialog(false);
      setSelectedIds(new Set());
      setBulkStatus('');
    } catch (err) {
      console.error("Bulk update failed:", err);
      alert('Bulk update failed. Please try again.');
    }
  };

  const handleExportCSV = (selectedColumnIds: string[], useFiltered: boolean) => {
    const dataToExport = useFiltered ? filtered : materials;
    
    if (dataToExport.length === 0) {
      alert('No records to export');
      return;
    }

    const exportData = dataToExport.map(m => {
      const row: any = {};
      selectedColumnIds.forEach(id => {
        const colDef = TRACKER_COLUMNS.find(c => c.id === id);
        if (colDef) {
          // Map technical keys to friendly labels
          let val = (m as any)[id] || '';
          if (id === 'plannedMsDate' || id === 'plannedPoDate' || id === 'actualMsDate' || id === 'dateSubmitted' || id === 'dateApproved') {
            // handle date strings
          }
          row[colDef.label] = val;
        }
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tracker");
    XLSX.writeFile(wb, `Material_Tracker_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    setShowExportModal(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-white">
      {/* Controls */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-2 items-center bg-white shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Search all fields..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-blue/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none"
          />
          <span className="text-slate-400 text-xs">-</span>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none"
          />
        </div>
        <select 
          value={filterDiv}
          onChange={(e) => setFilterDiv(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50 font-medium outline-none"
        >
          <option value="">All Divisions</option>
          {divisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select 
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50 font-medium outline-none"
        >
          <option value="">All Statuses</option>
          <option value="NOT SUBMITTED">Not Submitted</option>
          <option value="Submitted">Submitted</option>
          <option value="Under Review">Under Review</option>
          <option value="Approved">Approved</option>
          <option value="Approved As Noted">Approved w/ Notes</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select 
          value={filterPrio}
          onChange={(e) => setFilterPrio(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50 font-medium outline-none"
        >
          <option value="">All Priorities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        
        <button 
          onClick={() => setShowUpcoming7Days(!showUpcoming7Days)}
          className={cn(
            "text-xs border rounded-lg px-3 py-2 font-bold transition-all ml-1 flex items-center gap-1.5",
            showUpcoming7Days ? "bg-brand-blue text-white border-brand-blue shadow-sm" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700"
          )}
        >
          <Clock size={12} className={showUpcoming7Days ? "text-white/80" : "text-slate-400"} />
          Next 7 Days {showUpcoming7Days && "✓"}
        </button>

        <button 
          onClick={() => setShowOnlyMine(!showOnlyMine)}
          className={cn(
            "text-xs border rounded-lg px-3 py-2 font-bold transition-all ml-1 flex items-center gap-1.5",
            showOnlyMine ? "bg-brand-blue text-white border-brand-blue shadow-sm" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700"
          )}
        >
          <UserIcon size={12} className={showOnlyMine ? "text-white/80" : "text-slate-400"} />
          My Tasks {showOnlyMine && "✓"}
        </button>
        
        <div className="flex bg-slate-100 p-1 rounded-lg ml-auto items-center">
          <div 
             className="relative border-r border-slate-200 pr-1 mr-1 flex items-center"
             tabIndex={0}
             onBlur={(e) => {
               if (!e.currentTarget.contains(e.relatedTarget)) setShowColumnsMenu(false);
             }}
          >
            <button 
              onClick={() => setShowColumnsMenu(!showColumnsMenu)}
              className={cn("p-1.5 rounded-md transition-all", showColumnsMenu ? "bg-white shadow-sm text-brand-blue" : "text-slate-400 hover:text-slate-600")}
              title="Columns"
            >
              <Columns size={14} />
            </button>
            {showColumnsMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 shadow-xl rounded-xl z-50 p-2 flex flex-col">
                 <div className="text-xs font-bold text-slate-800 px-2 py-1 border-b border-slate-100 mb-2">Columns</div>
                 <div className="max-h-[300px] overflow-y-auto flex flex-col space-y-1">
                   {TRACKER_COLUMNS.map(c => (
                      <label key={c.id} className="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                         <input 
                           type="checkbox" 
                           checked={visibleColumns.has(c.id)} 
                           onChange={() => toggleColumn(c.id)} 
                           className="rounded border-slate-300 text-brand-blue outline-none" 
                         />
                         <span className="text-[11px] text-slate-700 font-medium select-none">{c.label}</span>
                      </label>
                   ))}
                 </div>
              </div>
            )}
          </div>
          <button 
            onClick={() => setViewMode('table')}
            className={cn("p-1.5 rounded-md transition-all", viewMode === 'table' ? "bg-white shadow-sm text-brand-blue" : "text-slate-400 hover:text-slate-600")}
            title="Table View"
          >
            <List size={14} />
          </button>
          <button 
            onClick={() => setViewMode('card')}
            className={cn("p-1.5 rounded-md transition-all", viewMode === 'card' ? "bg-white shadow-sm text-brand-blue" : "text-slate-400 hover:text-slate-600")}
            title="Card View"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
        
        <button 
          onClick={() => setShowExportModal(true)}
          className="px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Download size={14} />
          EXPORT CSV
        </button>
        {!sortConfig && (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-brand-blue/10 text-brand-blue rounded-lg text-[10px] font-bold uppercase tracking-wider animate-pulse border border-brand-blue/20">
            <GripVertical size={12} />
            Drag Handle Active
          </div>
        )}
        <button 
          onClick={() => setShowImport(true)}
          className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100 transition-colors"
        >
          <FileUp size={14} />
          AUTO-IMPORT LOG
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {selectedIds.size > 0 && (
          <div className="bg-brand-blue text-white px-4 py-2 flex items-center justify-between text-xs font-semibold shrink-0 shadow-sm z-10">
            <span>{selectedIds.size} items selected</span>
            <div className="flex items-center gap-2">
              <select 
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value)}
                className="bg-white text-slate-800 px-2 py-1 rounded outline-none border-0"
              >
                <option value="">Select new status...</option>
                <option value="NOT SUBMITTED">Not Submitted</option>
                <option value="Submitted">Submitted</option>
                <option value="Under Review">Under Review</option>
                <option value="Approved">Approved</option>
                <option value="Approved As Noted">Approved w/ Notes</option>
                <option value="REJECTED & RE-SUBMIT">Rejected</option>
              </select>
              <button 
                onClick={() => setShowBulkDialog(true)}
                disabled={!bulkStatus}
                className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Table/Card Container */}
        <div className="flex-1 overflow-auto min-h-0 pb-10">
          {viewMode === 'card' ? (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((m) => {
              const msDelayed = isDelayed(m.plannedMsDate, m.status, ['Submitted', 'Under Review', 'Approved', 'Approved As Noted']);
              const poDelayed = isDelayed(m.plannedPoDate, m.poStatus, ['Issued', 'Cash Issue']);
              const delayed = msDelayed || poDelayed;

              return (
                <div 
                  key={m.id}
                  draggable={!sortConfig}
                  onDragStart={(e) => handleDragStart(e, m.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, m.id)}
                  onClick={() => setSelectedItem(m)}
                  className={cn(
                    "relative bg-white border rounded-xl shadow-sm p-4 cursor-pointer transition-all hover:shadow-md",
                    delayed ? "border-rose-200 bg-rose-50/10" : "border-slate-200",
                    draggedItemId === m.id && "opacity-40 scale-95"
                  )}
                >
                  {delayed && <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 rounded-l-xl" />}
                  
                  <div className="flex justify-between items-start mb-2 gap-2">
                    {!sortConfig && (
                      <div className="text-slate-300 flex items-center shrink-0 cursor-grab active:cursor-grabbing hover:text-brand-blue">
                         <GripVertical size={12} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 mt-0.5">
                        {delayed && <AlertCircle size={14} className="text-rose-500 shrink-0" />}
                        <span className="font-bold text-slate-800 text-[13px] truncate">{m.activityId || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 font-mono">{m.boqRef}</span>
                        <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase px-1.5 py-0.5 bg-slate-100 rounded">{m.division}</span>
                      </div>
                    </div>
                    <StatusPill status={m.status} />
                  </div>
                  
                  <h4 className="text-[13px] font-medium text-slate-700 mb-3 line-clamp-2 leading-relaxed">{m.description}</h4>
                  
                  {m.responsible && (
                    <div className="flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2.5 py-1.5 rounded-lg w-fit text-[11px] font-medium border border-slate-200 mb-3">
                      <UserIcon size={12} className="text-slate-400" />
                      {m.responsible}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-y-4 gap-x-3 text-[11px] bg-slate-50 p-3 rounded-lg border border-slate-100/50">
                    <div>
                      <div className="text-slate-400 font-medium mb-1">Planned MS</div>
                      <div className="flex flex-col gap-0.5">
                        <span className={cn("font-medium", msDelayed ? "text-rose-600" : "text-slate-700")}>
                          {m.plannedMsDate || '-'}
                        </span>
                        {msDelayed && <span className="text-[9px] font-bold text-rose-500 flex items-center gap-1 animate-pulse"><Clock size={10} /> DELAYED</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-medium mb-1">Planned PO</div>
                      <div className="flex flex-col gap-0.5">
                        <span className={cn("font-medium", poDelayed ? "text-rose-600" : "text-slate-700")}>
                          {m.plannedPoDate || '-'}
                        </span>
                        {poDelayed && <span className="text-[9px] font-bold text-rose-500 flex items-center gap-1 animate-pulse"><Clock size={10} /> DELAYED</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-medium mb-1">mockup/sample/DWG Status</div>
                      {m.irDwgRequired === 'REQUIRED' ? (
                        <StatusPill status={m.irDwgStatus || 'NOT SUBMITTED'} size="sm" />
                      ) : (
                        <span className="text-[10px] text-slate-300 font-medium italic">N/A</span>
                      )}
                    </div>
                    <div>
                      <div className="text-slate-400 font-medium mb-1 flex items-center justify-between">
                        <span>PO Status</span>
                        <span className="scale-90 origin-right"><PriorityBadge priority={m.priority} /></span>
                      </div>
                      <StatusPill status={m.poStatus || 'not Issued'} size="sm" />
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <table className="material-table min-w-full w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead>
              <tr>
                {!sortConfig && <th style={{ width: 30 }} className="bg-slate-50/50"></th>}
                <th className="relative group px-4 py-3" style={{ width: columnWidths.selection }}>
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAll}
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  />
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'selection')} isResizing={resizing?.id === 'selection'} />
                </th>
                {visibleColumns.has('activityId') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.activityId }} onClick={() => handleSort('activityId')}>
                  <div className="truncate">Act. ID {sortConfig?.key === 'activityId' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'activityId')} isResizing={resizing?.id === 'activityId'} />
                </th>
                )}
                {visibleColumns.has('boqRef') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.boqRef }} onClick={() => handleSort('boqRef')}>
                  <div className="truncate">BOQ Ref {sortConfig?.key === 'boqRef' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'boqRef')} isResizing={resizing?.id === 'boqRef'} />
                </th>
                )}
                {visibleColumns.has('division') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.division }} onClick={() => handleSort('division')}>
                  <div className="truncate">Division {sortConfig?.key === 'division' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'division')} isResizing={resizing?.id === 'division'} />
                </th>
                )}
                {visibleColumns.has('description') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.description }}>
                  <div className="truncate">Description</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'description')} isResizing={resizing?.id === 'description'} />
                </th>
                )}
                {visibleColumns.has('responsible') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.responsible }} onClick={() => handleSort('responsible')}>
                  <div className="truncate">Responsible {sortConfig?.key === 'responsible' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'responsible')} isResizing={resizing?.id === 'responsible'} />
                </th>
                )}
                {visibleColumns.has('plannedMsDate') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.plannedMsDate }}>
                  <div className="truncate">Planned MS</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'plannedMsDate')} isResizing={resizing?.id === 'plannedMsDate'} />
                </th>
                )}
                {visibleColumns.has('status') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.status }} onClick={() => handleSort('status')}>
                  <div className="truncate">Status {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'status')} isResizing={resizing?.id === 'status'} />
                </th>
                )}
                {visibleColumns.has('irDwgStatus') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.irDwgStatus }}>
                  <div className="truncate">mockup/sample/DWG</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'irDwgStatus')} isResizing={resizing?.id === 'irDwgStatus'} />
                </th>
                )}
                {visibleColumns.has('plannedPoDate') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.plannedPoDate }}>
                  <div className="truncate">Planned PO</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'plannedPoDate')} isResizing={resizing?.id === 'plannedPoDate'} />
                </th>
                )}
                {visibleColumns.has('poStatus') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.poStatus }}>
                  <div className="truncate">PO Status</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'poStatus')} isResizing={resizing?.id === 'poStatus'} />
                </th>
                )}
                {visibleColumns.has('priority') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.priority }} onClick={() => handleSort('priority')}>
                  <div className="truncate">Priority {sortConfig?.key === 'priority' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'priority')} isResizing={resizing?.id === 'priority'} />
                </th>
                )}
                {visibleColumns.has('nextAction') && (
                <th className="relative group px-4 py-3" style={{ width: columnWidths.nextAction }}>
                  <div className="truncate">Next Action</div>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'nextAction')} isResizing={resizing?.id === 'nextAction'} />
                </th>
                )}
                <th className="relative group px-4 py-3" style={{ width: columnWidths.actions }}>
                  <Resizer onMouseDown={(e) => handleResizeStart(e, 'actions')} isResizing={resizing?.id === 'actions'} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const msDelayed = isDelayed(m.plannedMsDate, m.status, ['Submitted', 'Under Review', 'Approved', 'Approved As Noted']);
                const poDelayed = isDelayed(m.plannedPoDate, m.poStatus, ['Issued', 'Cash Issue']);
                const delayed = msDelayed || poDelayed;

                return (
                  <tr 
                    key={m.id} 
                    draggable={!sortConfig}
                    onDragStart={(e) => handleDragStart(e, m.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, m.id)}
                    className={cn(
                      "hover:bg-slate-50 cursor-pointer transition-colors relative", 
                      selectedItem?.id === m.id && "bg-slate-50", 
                      selectedIds.has(m.id) && "bg-brand-blue/5",
                      delayed && "bg-rose-50/30",
                      draggedItemId === m.id && "opacity-40 bg-slate-100"
                    )}
                    onClick={() => setSelectedItem(m)}
                  >
                    {!sortConfig && (
                      <td className="px-1 text-slate-300">
                        <div className="flex items-center justify-center p-1 hover:text-brand-blue transition-colors cursor-grab active:cursor-grabbing">
                          <GripVertical size={12} />
                        </div>
                      </td>
                    )}
                    <td className="relative px-4 py-3" onClick={(e) => handleSelectOne(e, m.id)}>
                      {delayed && <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />}
                      <input type="checkbox" checked={selectedIds.has(m.id)} readOnly />
                    </td>
                    {visibleColumns.has('activityId') && (
                    <td className="font-bold text-slate-700 px-4 py-3 overflow-hidden">
                      <div className="flex items-center gap-2 truncate">
                        {delayed && <AlertCircle size={14} className="text-rose-500 shrink-0" />}
                        {m.activityId || '-'}
                      </div>
                    </td>
                    )}
                    {visibleColumns.has('boqRef') && <td className="font-mono text-slate-400 px-4 py-3 truncate">{m.boqRef}</td>}
                    {visibleColumns.has('division') && <td className="text-[10px] text-slate-400 px-4 py-3 truncate">{(m.division || '').replace('DIV.', 'D')}</td>}
                    {visibleColumns.has('description') && (
                    <td className="font-medium text-slate-700 px-4 py-3 overflow-hidden" title={m.description}>
                      <div className="truncate">{m.description}</div>
                    </td>
                    )}
                    {visibleColumns.has('responsible') && (
                    <td className="px-4 py-3 overflow-hidden">
                      {m.responsible ? (
                        <div className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2 py-1 rounded w-fit text-[10px] font-medium border border-slate-200 truncate">
                          <UserIcon size={10} className="text-slate-400 shrink-0" />
                          <span className="truncate">{m.responsible}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    )}
                    {visibleColumns.has('plannedMsDate') && (
                    <td className="px-4 py-3 overflow-hidden">
                      <div className="flex flex-col gap-0.5 truncate">
                        <span className={cn("text-[10px] font-medium truncate", msDelayed ? "text-rose-600 font-bold" : "text-slate-500")}>
                          {m.plannedMsDate || '-'}
                        </span>
                        {msDelayed && (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-rose-500 animate-pulse truncate">
                            <Clock size={10} className="shrink-0" /> <span className="truncate">DELAYED SUB.</span>
                          </span>
                        )}
                      </div>
                    </td>
                    )}
                    {visibleColumns.has('status') && (
                    <td className="px-4 py-3 overflow-hidden">
                      <StatusPill status={m.status} />
                    </td>
                    )}
                    {visibleColumns.has('irDwgStatus') && (
                    <td className="px-4 py-3 overflow-hidden">
                      {m.irDwgRequired === 'REQUIRED' ? (
                        <div className="flex flex-col gap-0.5 truncate">
                          <span className="text-[9px] font-bold text-slate-400 tracking-tighter truncate">REQ.</span>
                          <StatusPill status={m.irDwgStatus || 'NOT SUBMITTED'} size="sm" />
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-medium italic truncate">N/A</span>
                      )}
                    </td>
                    )}
                    {visibleColumns.has('plannedPoDate') && (
                    <td className="px-4 py-3 overflow-hidden">
                      <div className="flex flex-col gap-0.5 truncate">
                        <span className={cn("text-[10px] font-medium truncate", poDelayed ? "text-rose-600 font-bold" : "text-slate-500")}>
                          {m.plannedPoDate || '-'}
                        </span>
                        {poDelayed && (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-rose-500 animate-pulse truncate">
                            <Clock size={10} className="shrink-0" /> <span className="truncate">DELAYED APP.</span>
                          </span>
                        )}
                      </div>
                    </td>
                    )}
                    {visibleColumns.has('poStatus') && (
                    <td className="px-4 py-3 overflow-hidden">
                      <StatusPill status={m.poStatus || 'not Issued'} size="sm" />
                    </td>
                    )}
                  {visibleColumns.has('priority') && (
                  <td className="px-4 py-3 overflow-hidden">
                    <PriorityBadge priority={m.priority} />
                  </td>
                  )}
                  {visibleColumns.has('nextAction') && (
                  <td className="text-[10px] text-slate-400 px-4 py-3 truncate" title={m.nextAction}>{m.nextAction}</td>
                  )}
                  <td className="text-right px-4 py-3 shrink-0">
                    <button className="px-2 py-0.5 border border-slate-200 rounded text-[9px] font-bold uppercase tracking-tight text-slate-500 hover:bg-white hover:text-slate-900 transition-all whitespace-nowrap">
                      View ↗
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
          )}
          {filtered.length === 0 && (
            <div className="p-12 text-center text-slate-400 text-xs">
              No matching records found.
            </div>
          )}
        </div>

        {/* Footer info line like the design */}
        <div className="absolute bottom-0 left-0 right-0 h-8 border-t border-slate-200 bg-white px-4 flex items-center justify-between text-[11px] text-slate-400 z-10">
          <span>{filtered.length} items found</span>
          <span>Click a row to view details & update status</span>
        </div>

        {/* Item Detail Modal */}
        {selectedItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div 
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-5 duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-blue/5 flex items-center justify-center text-brand-blue">
                    <Package size={20} />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-800 leading-tight">Material Submittal Detail</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedItem.boqRef} • {selectedItem.division}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedItem(null)} 
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
                >
                  ✕
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Left Column: Infos & History */}
                  <div className="lg:col-span-2 space-y-8">
                    
                    {/* Status Timeline */}
                    <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Workflow Status</h5>
                      <StatusTimeline item={selectedItem} />
                    </div>

                    {/* Primary Info Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                      <DetailRow label="BOQ Reference" value={selectedItem.boqRef} />
                      <DetailRow label="Division" value={selectedItem.division} />
                      <DetailRow label="Activity ID" value={selectedItem.activityId || '-'} />
                      <DetailRow label="Supplier / Manufacturer" value={selectedItem.supplier} />
                      <DetailRow label="Location / Area" value={selectedItem.location} />
                      <DetailRow label="Unit & Qty" value={`${selectedItem.quantity} ${selectedItem.unit}`} />
                      <DetailRow label="Next Action" value={selectedItem.nextAction || '-'} />
                      <DetailRow label="MS Reference" value={selectedItem.id.slice(0, 8).toUpperCase()} />
                      <DetailRow label="Revision" value={selectedItem.rev || 'R00'} />
                    </div>

                    {selectedItem.description && (
                      <div className="pt-4 border-t border-slate-100">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Description</label>
                        <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">{selectedItem.description}</p>
                      </div>
                    )}


                    {/* History Section moved here for better space utilization */}
                    <div className="pt-8 border-t border-slate-100">
                       <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Submission & Audit History</h5>
                       <HistoryList materialId={selectedItem.id} />
                    </div>
                  </div>

                  {/* Right Column: Update Form */}
                  <div className="lg:col-span-1">
                    <div className="sticky top-0 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                       <div className="flex items-center gap-2 mb-6">
                         <div className="w-1 bg-brand-blue h-4 rounded-full" />
                         <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Update Submittal</h5>
                       </div>
                       <ItemUpdateForm item={selectedItem} user={user} onUpdated={() => {}} />
                    </div>
                  </div>

                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="px-6 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 transition-all shadow-sm"
                >
                  Close Detail
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Batch Import Modal */}
      {showImport && (
        <BatchImportModal user={user} selectedJob={selectedJob} onClose={() => setShowImport(false)} />
      )}

      {/* Export CSV Modal */}
      {showExportModal && (
        <ExportCSVModal 
          materials={materials}
          filteredMaterials={filtered}
          onClose={() => setShowExportModal(false)}
          onExport={handleExportCSV}
        />
      )}

      {/* Bulk Update Confirmation Dialog */}
      {showBulkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirm Bulk Update</h3>
            <p className="text-sm text-slate-600 mb-6">
              You are about to change the status of <strong>{selectedIds.size} items</strong> to <strong>{bulkStatus}</strong>.
              This action will be logged in the audit trail.
            </p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setShowBulkDialog(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executeBulkUpdate}
                className="px-4 py-2 text-xs font-bold text-white bg-brand-blue rounded-lg hover:opacity-90 transition-opacity"
              >
                Confirm Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
      <p className="text-[12px] text-slate-800 font-medium leading-normal">{value}</p>
    </div>
  );
}

const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

function StatusTimeline({ item }: { item: MaterialSubmittal }) {
  const steps = [
    { key: 'NOT SUBMITTED', label: 'Not Sub.' },
    { key: 'Submitted', label: 'Submitted' },
    { key: 'Under Review', label: 'Review' },
    { key: 'Approved|Approved As Noted', label: 'Approved' }
  ];

  const currentStatus = (item.status || 'NOT SUBMITTED').toUpperCase();
  const isRejected = currentStatus.includes('REJECTED');
  
  let currentStepIndex = 0;
  if (isRejected) {
    currentStepIndex = 1; // Send back to submitted/rejected stage
  } else if (currentStatus.includes('APPROVED')) {
    currentStepIndex = 3;
  } else if (currentStatus === 'UNDER REVIEW' || currentStatus === 'PENDING') {
    currentStepIndex = 2;
  } else if (currentStatus === 'SUBMITTED') {
    currentStepIndex = 1;
  }

  return (
    <div className="relative flex justify-between items-center mb-4 px-2">
      <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-100 rounded-full z-0" />
      <div 
        className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-brand-blue rounded-full z-0 transition-all duration-500 ease-in-out"
        style={{ width: `calc(${(currentStepIndex / (steps.length - 1)) * 100}% - 2rem)` }}
      />
      
      {steps.map((step, idx) => {
        const isCompleted = idx <= currentStepIndex;
        const isActive = idx === currentStepIndex;
        const isError = isRejected && isActive && idx !== 3; // Show red if rejected at current stage

        return (
          <div key={idx} className="relative z-10 flex flex-col items-center gap-2">
            <div 
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors shadow-sm",
                isError ? "bg-rose-500 text-white border-2 border-rose-600 ring-4 ring-rose-50" :
                isActive ? "bg-brand-blue text-white border-2 border-brand-blue ring-4 ring-brand-blue/10" :
                isCompleted ? "bg-brand-blue text-white border-2 border-brand-blue" :
                "bg-white border-2 border-slate-200 text-slate-300"
              )}
            >
              {isCompleted && !isError ? <Check size={12} strokeWidth={3} /> : (idx + 1)}
            </div>
            <span 
              className={cn(
                "text-[9px] font-bold uppercase tracking-wider absolute top-8 whitespace-nowrap",
                isError ? "text-rose-600" :
                isActive ? "text-brand-blue" :
                isCompleted ? "text-slate-700" :
                "text-slate-400"
              )}
            >
              {isError ? 'Rejected' : step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({ materialId }: { materialId: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [filterUser, setFilterUser] = useState('');

  useEffect(() => {
    // We now read from auditLog for structured changes
    const q = query(collection(db, 'materials', materialId, 'auditLog'), orderBy('timestamp', sortOrder));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [materialId, sortOrder]);

  const filteredHistory = history.filter(h => 
    !filterUser || (h.updatedBy || '').toLowerCase().includes(filterUser.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <select 
          value={sortOrder} 
          onChange={e => setSortOrder(e.target.value as any)}
          className="text-[10px] p-1.5 border border-slate-200 rounded text-slate-600 bg-white"
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
        <input 
          type="text" 
          placeholder="Filter by user..." 
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="text-[10px] p-1.5 border border-slate-200 rounded flex-1 min-w-0"
        />
      </div>

      {loading ? (
        <div className="text-[10px] text-slate-400 animate-pulse">Loading history...</div>
      ) : (
        <div className="space-y-6 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-200">
          {filteredHistory.map((h) => (
            <AuditLogItem key={h.id} h={h} />
          ))}
          {filteredHistory.length === 0 && <div className="text-[10px] text-slate-400 italic">No history records matched.</div>}
        </div>
      )}
    </div>
  );
}

const AuditLogItem: React.FC<{ h: any }> = ({ h }) => {
  const timestamp = h.timestamp?.toDate ? h.timestamp.toDate() : new Date();
  
  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-white border-2 border-brand-blue flex items-center justify-center">
         <div className="w-1.5 h-1.5 rounded-full bg-brand-blue" />
      </div>
      <div className="group space-y-1.5 mt-[-2px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-800">{h.updatedBy || 'Unknown'}</span>
          <span className="text-[9px] text-slate-400 font-medium">
            {format(timestamp, 'dd MMM yyyy HH:mm')}
          </span>
        </div>

        {h.note && (
          <div className="bg-amber-50 border-l-2 border-amber-400 p-2 rounded-r animate-in fade-in slide-in-from-left-1 mb-2">
             <p className="text-[11px] text-amber-900 font-medium leading-relaxed italic">
               "
               {h.note.split(/(@(\w+)|@\[([^\]]+)\])/g).map((part: string, i: number) => {
                 if (part && (part.startsWith('@') || /@(\w+)|@\[([^\]]+)\]/.test(part))) {
                   // We need to be careful with the split regex capturing groups
                   // For simplicity, let's just check if it's a mention part
                   if (part.startsWith('@')) {
                     return <span key={i} className="text-brand-blue font-bold not-italic">{part}</span>;
                   }
                 }
                 return part;
               })}
               "
             </p>
          </div>
        )}

        <div className="space-y-1">
          {h.changes && Array.isArray(h.changes) && h.changes.length > 0 ? (
            h.changes.map((c: any, i: number) => (
              <div key={i} className="text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100 flex flex-col gap-0.5">
                <span className="font-bold text-slate-500 uppercase tracking-widest">{c.field}</span>
                <span className="text-slate-600">
                  <span className="line-through opacity-50 mr-1">{c.oldValue}</span>
                  →
                  <strong className="text-brand-blue ml-1 font-semibold">{c.newValue}</strong>
                </span>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-slate-500 italic">Data update processed.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemUpdateForm({ item, user, onUpdated }: { item: MaterialSubmittal; user: any; onUpdated: () => void }) {
  const [status, setStatus] = useState(item.status);
  const [activityId, setActivityId] = useState(item.activityId || '');
  const [nextAction, setNextAction] = useState(item.nextAction || '');
  const [responsible, setResponsible] = useState(item.responsible || 'Contractor');
  const [irDwgRequired, setIrDwgRequired] = useState(item.irDwgRequired || 'NOT REQUIRED');
  const [irDwgStatus, setIrDwgStatus] = useState(item.irDwgStatus || 'NOT SUBMITTED');
  const [poStatus, setPoStatus] = useState(item.poStatus || 'not Issued');
  const [rev, setRev] = useState(item.rev || 'R00');
  const [finishCode, setFinishCode] = useState(item.finishCode || '');
  const [supplier, setSupplier] = useState(item.supplier || '');
  const [location, setLocation] = useState(item.location || '');
  const [irRef, setIrRef] = useState(item.irRef || '');
  const [plannedMsDate, setPlannedMsDate] = useState(item.plannedMsDate || '');
  const [plannedPoDate, setPlannedPoDate] = useState(item.plannedPoDate || '');
  const [jobId, setJobId] = useState(item.jobId || '');
  const [updateNote, setUpdateNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates: any = {
        status, activityId, nextAction, responsible, irDwgRequired, irDwgStatus, poStatus,
        rev, finishCode, supplier, location, irRef, plannedMsDate, plannedPoDate, jobId
      };

      const changes: any[] = [];
      Object.keys(updates).forEach(key => {
        if (updates[key] !== (item as any)[key]) {
          changes.push({
            field: key,
            oldValue: (item as any)[key] || 'None',
            newValue: updates[key] || 'None'
          });
        }
      });

      if (changes.length > 0 || updateNote.trim()) {
        updates.updatedAt = serverTimestamp();
        
        // Extract @mentions: @Name or @[Name with Space]
        const mentionRegex = /@(\w+)|@\[([^\]]+)\]/g;
        const currentMentions: string[] = [];
        let match;
        while ((match = mentionRegex.exec(updateNote)) !== null) {
          const name = match[1] || match[2];
          if (name) currentMentions.push(name);
        }

        if (currentMentions.length > 0) {
          const existingMentions = (item as any).mentions || [];
          updates.mentions = Array.from(new Set([...existingMentions, ...currentMentions]));
        }

        const batch = writeBatch(db);
        batch.update(doc(db, 'materials', item.id), updates);
        
        batch.set(doc(collection(db, 'materials', item.id, 'auditLog')), {
          timestamp: serverTimestamp(),
          updatedBy: user.displayName || user.email,
          changes,
          note: updateNote.trim() || null
        });

        await batch.commit();
        setUpdateNote('');

        try {
          if (updates.status === 'REJECTED' || updates.status === 'REJECTED & RE-SUBMIT') {
            await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'rejection', item: { ...item, status: updates.status, description: item.description } })
            });
          }
        } catch (e) {
          console.error("Failed to send notification", e);
        }
      }

      onUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Activity ID</label>
          <input 
            type="text"
            value={activityId}
            onChange={e => setActivityId(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            placeholder="e.g. ACT-100"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">General Status</label>
          <select 
            value={status} 
            onChange={e => setStatus(e.target.value)}
            className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          >
            <option>NOT SUBMITTED</option>
            <option>Submitted</option>
            <option>Under Review</option>
            <option>Approved</option>
            <option>Approved As Noted</option>
            <option>REJECTED & RE-SUBMIT</option>
          </select>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsibility</label>
          <select 
            value={responsible}
            onChange={e => setResponsible(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          >
            <option>Contractor</option>
            <option>Consultant</option>
            <option>Client</option>
            <option>Site</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-50">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revision</label>
          <input 
            type="text"
            value={rev}
            onChange={e => setRev(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Finish Code</label>
          <input 
            type="text"
            value={finishCode}
            onChange={e => setFinishCode(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-50">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Supplier</label>
          <input 
            type="text"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</label>
          <input 
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-50">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">mockup/sample/DWG Required?</label>
          <select 
            value={irDwgRequired}
            onChange={e => setIrDwgRequired(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          >
            <option value="REQUIRED">Required</option>
            <option value="NOT REQUIRED">Not Required</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">mockup/sample/DWG Status</label>
          <select 
            value={irDwgStatus}
            disabled={irDwgRequired === 'NOT REQUIRED'}
            onChange={e => setIrDwgStatus(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:opacity-50"
          >
            <option>NOT SUBMITTED</option>
            <option>PENDING</option>
            <option>APPROVED</option>
            <option>REJECTED & RE-SUBMITTING</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-50">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MS Ref. NO</label>
          <input 
            type="text"
            value={irRef}
            onChange={e => setIrRef(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            placeholder="e.g. IR-ARCH-001"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Next Action</label>
          <textarea 
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none min-h-[60px]"
            placeholder="e.g. Submit IR for site inspection"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Linked Job ID</label>
          <input 
            type="text"
            value={jobId}
            onChange={e => setJobId(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            placeholder="e.g. M8bX..."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PO Status</label>
          <select 
            value={poStatus}
            onChange={e => setPoStatus(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          >
            <option>not Issued</option>
            <option>Issued</option>
            <option>Cash Issue</option>
            <option>waiting management approval</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-50">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Planned Submittal Date</label>
          <input 
            type="date"
            value={plannedMsDate}
            onChange={e => setPlannedMsDate(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Planned Approval Date</label>
          <input 
            type="date"
            value={plannedPoDate}
            onChange={e => setPlannedPoDate(e.target.value)}
            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
          />
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
            Update Note (Reflected in History)
            <span className="text-[8px] opacity-60 font-normal">Optional</span>
          </label>
          <textarea 
            value={updateNote}
            onChange={e => setUpdateNote(e.target.value)}
            className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none min-h-[80px] focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue transition-all"
            placeholder="Describe the reason for this change or any specific status notes..."
          />
        </div>
      </div>

      <button 
        onClick={handleSave} 
        disabled={isSaving}
        className="w-full mt-4 py-2.5 bg-brand-blue text-white rounded-lg text-[12px] font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : 'Save Updates (Auto Logs History)'}
      </button>
    </div>
  );
}

const toBase64 = (file: File): Promise<string> => 
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

function ExportCSVModal({ 
  materials, 
  filteredMaterials, 
  onClose, 
  onExport 
}: { 
  materials: MaterialSubmittal[]; 
  filteredMaterials: MaterialSubmittal[]; 
  onClose: () => void; 
  onExport: (columns: string[], useFiltered: boolean) => void;
}) {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(TRACKER_COLUMNS.map(c => c.id)));
  const [useFiltered, setUseFiltered] = useState(true);

  const toggleColumn = (id: string) => {
    setSelectedColumns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800 tracking-tight">Export Configuration</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Scope</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="radio" 
                  checked={useFiltered} 
                  onChange={() => setUseFiltered(true)}
                  className="w-4 h-4 text-brand-blue border-slate-300 focus:ring-brand-blue/20"
                />
                <span className="text-xs font-medium text-slate-700 group-hover:text-brand-blue transition-colors">Filtered List ({filteredMaterials.length})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="radio" 
                  checked={!useFiltered} 
                  onChange={() => setUseFiltered(false)}
                  className="w-4 h-4 text-brand-blue border-slate-300 focus:ring-brand-blue/20"
                />
                <span className="text-xs font-medium text-slate-700 group-hover:text-brand-blue transition-colors">All Records ({materials.length})</span>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Include Columns</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedColumns(new Set(TRACKER_COLUMNS.map(c => c.id)))}
                  className="text-[9px] font-bold text-brand-blue hover:underline"
                >
                  Select All
                </button>
                <button 
                  onClick={() => setSelectedColumns(new Set())}
                  className="text-[9px] font-bold text-slate-400 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto p-1">
              {TRACKER_COLUMNS.map(col => (
                <label key={col.id} className="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-100 rounded-lg hover:bg-white hover:border-brand-blue/30 cursor-pointer transition-all">
                  <input 
                    type="checkbox" 
                    checked={selectedColumns.has(col.id)}
                    onChange={() => toggleColumn(col.id)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-brand-blue focus:ring-brand-blue/20"
                  />
                  <span className="text-[11px] font-medium text-slate-600">{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onExport(Array.from(selectedColumns), useFiltered)}
            disabled={selectedColumns.size === 0}
            className="px-6 py-2 bg-brand-blue text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-blue-900/10 active:scale-[0.98]"
          >
            <Download size={14} />
            Generate CSV
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchImportModal({ user, selectedJob, onClose }: { user: any; selectedJob?: Job | null; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const parseDocument = async () => {
    if (!file) return;

    // Strict validation to prevent proxy XHR payload / timeout errors (approx ~4MB proxy limit)
    // Base64 encoding inflates size by 33%, so 2.5MB is the absolute safe limit for files.
    const MAX_FILE_SIZE = 2.5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Please upload a file smaller than 2.5MB, or test with a lighter tracking log.`);
      return;
    }

    setIsParsing(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let promptContent: any[] = [];

      const isExcel = file.name.toLowerCase().endsWith('.xlsx') || 
                      file.name.toLowerCase().endsWith('.xls') || 
                      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                      file.type === 'application/vnd.ms-excel';

      if (isExcel) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
        
        // Filter out completely empty rows, strip trailing empty cells per row, and limit to 100 rows
        const cleanedRows = rawRows
          .filter(row => row.some(cell => cell !== null && cell !== ""))
          .map(row => {
            let lastDataIndex = -1;
            for (let i = row.length - 1; i >= 0; i--) {
              if (row[i] !== null && row[i] !== "") {
                lastDataIndex = i;
                break;
              }
            }
            return row.slice(0, lastDataIndex + 1);
          })
          .slice(0, 100);

        const jsonString = JSON.stringify(cleanedRows);
        if (jsonString.length > 2.5 * 1024 * 1024) {
          throw new Error('Spreadsheet data is too dense. Please remove extraneous columns or reduce rows.');
        }

        promptContent = [
          { text: `EXTRACT EVERY SINGLE MATERIAL ITEM from this spreadsheet data. 
          The data is a 2D matrix (rows/cells).
          
          MISSION: Exhaustive extraction. Do not skip any physical items.
          
          Spreadsheet Data: 
          ${JSON.stringify(cleanedRows)}
          
          Mapping Requirements (Normalize to these keys):
          - activityId: e.g. ACT-01
          - division: e.g. ARCHITECTURE
          - boqRef: e.g. 1.1
          - description: FULL MATERIAL DESCRIPTION
          - finishCode: Material code
          - location: Zone/Area
          - supplier: Manufacturer
          - unit: e.g. m2, set, length
          - quantity: Number
          - status: MUST be one of: 'NOT SUBMITTED', 'Submitted', 'Under Review', 'Approved', 'REJECTED', 'APPROVED AS NOTED'
          - priority: 'HIGH', 'MEDIUM', 'LOW'
          - irRef: MS Ref NO
          - plannedMsDate: ISO Date
          - plannedPoDate: ISO Date
          
          Return ONLY a JSON object with 'items' array. If a field is missing in the data, leave it as null or empty string, but extract the row.` }
        ];
      } else {
        const base64Data = await toBase64(file);
        const fileContent = base64Data.split(',')[1];
        
        promptContent = [
          { text: `Extract ALL material tracking line items from this document. 
          Scan the entire layout carefully. Do not group items; extract every unique row.
          
          Fields: activityId, division, boqRef, description, finishCode, supplier, unit, quantity, status, priority, irRef, plannedMsDate, plannedPoDate.
          
          Normalization:
          - status: 'NOT SUBMITTED', 'Submitted', 'Under Review', 'Approved', 'REJECTED', 'APPROVED AS NOTED'
          - priority: 'HIGH', 'MEDIUM', 'LOW'
          - dates: YYYY-MM-DD
          
          Return JSON object with 'items' array.` },
          { inlineData: { data: fileContent, mimeType: file.type } }
        ];
      }

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: { parts: promptContent },
        config: {
          systemInstruction: "You are a professional material controller specialized in construction logistics. Your goal is to accurately and EXHAUSTIVELY extract material tracking logs from documents. Ensure every line item is captured exactly as presented, normalized to the requested JSON schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    activityId: { type: Type.STRING },
                    division: { type: Type.STRING },
                    boqRef: { type: Type.STRING },
                    description: { type: Type.STRING },
                    supplier: { type: Type.STRING },
                    unit: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    location: { type: Type.STRING },
                    status: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    finishCode: { type: Type.STRING },
                    irRef: { type: Type.STRING },
                    plannedMsDate: { type: Type.STRING },
                    plannedPoDate: { type: Type.STRING }
                  },
                  required: ["description"]
                }
              }
            }
          }
        }
      });

      const parsed = JSON.parse(response.text || '{"items":[]}');
      setPreviewData(parsed.items || []);
    } catch (err: any) {
      console.error("Batch Import Error:", err);
      setError(`AI Processing Error: ${err.message || 'Verification of document failed'}`);
    } finally {
      setIsParsing(false);
    }
  };

  const saveToTracker = async () => {
    setIsSaving(true);
    try {
      for (const item of previewData) {
        // Enforce required fields for firestore rules: ['division', 'description', 'status', 'priority', 'quantity']
        const statusMap = ['NOT SUBMITTED', 'Submitted', 'Under Review', 'Approved', 'REJECTED', 'APPROVED AS NOTED'];
        const validStatus = statusMap.includes(item.status) ? item.status : 'NOT SUBMITTED';
        const priorityMap = ['HIGH', 'MEDIUM', 'LOW'];
        const validPriority = priorityMap.includes(item.priority) ? item.priority : 'MEDIUM';

        // Meticulously construct the data object to strictly satisfy isValidMaterial limits and prevent nulls
        const materialData: any = {
          division: String(item.division || 'Unclassified').slice(0, 100),
          description: String(item.description || 'Unknown Material').slice(0, 5000),
          status: validStatus,
          priority: validPriority,
          quantity: item.quantity ? Number(item.quantity) : 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (item.activityId && String(item.activityId).trim() !== '') materialData.activityId = String(item.activityId).slice(0, 100);
        if (item.boqRef && String(item.boqRef).trim() !== '') materialData.boqRef = String(item.boqRef).slice(0, 100);
        if (item.supplier && String(item.supplier).trim() !== '') materialData.supplier = String(item.supplier).slice(0, 500);
        if (item.unit && String(item.unit).trim() !== '') materialData.unit = String(item.unit).slice(0, 100);
        if (item.location && String(item.location).trim() !== '') materialData.location = String(item.location).slice(0, 500);
        if (item.finishCode && String(item.finishCode).trim() !== '') materialData.finishCode = String(item.finishCode).slice(0, 200);
        if (item.irRef && String(item.irRef).trim() !== '') materialData.irRef = String(item.irRef).slice(0, 200);
        if (item.plannedMsDate && String(item.plannedMsDate).trim() !== '') materialData.plannedMsDate = String(item.plannedMsDate).slice(0, 100);
        if (item.plannedPoDate && String(item.plannedPoDate).trim() !== '') materialData.plannedPoDate = String(item.plannedPoDate).slice(0, 100);
        if (selectedJob) materialData.jobId = String(selectedJob.id).slice(0, 128);

        const docRef = await addDoc(collection(db, 'materials'), materialData);

        // Log initial batch import to history
        await addDoc(collection(db, 'materials', docRef.id, 'history'), {
          status: validStatus,
          comment: `Imported via Batch Tracking Log Scan.`,
          updatedBy: String(user?.displayName || 'System Import').slice(0, 200),
          timestamp: serverTimestamp()
        });
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(`Failed to save items to tracker: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Auto-Import Tracking Log</h4>
            {selectedJob && (
              <span className="text-xs font-semibold text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded mt-1 inline-block">
                Importing to: {selectedJob.name}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:text-slate-900 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          {!previewData.length ? (
            <div className="flex flex-col items-center justify-center min-h-[450px]">
              <div className="bg-white border-[3px] border-dashed border-slate-200 rounded-[32px] p-16 max-w-xl w-full flex flex-col items-center text-center shadow-sm hover:border-brand-blue/30 hover:shadow-xl hover:shadow-brand-blue/5 transition-all duration-300 group relative">
                <div className="w-24 h-24 bg-brand-blue/5 text-brand-blue rounded-3xl flex items-center justify-center mb-8 ring-8 ring-brand-blue/5 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                  <FileUp size={48} strokeWidth={1.5} />
                </div>
                <h5 className="font-bold text-slate-800 text-2xl mb-4 tracking-tight">Smart Data Extraction</h5>
                <p className="text-sm text-slate-500 font-medium mb-12 max-w-[320px] leading-relaxed">
                  Upload your Material Tracking Log (PDF, Excel, or Photo) and let Gemini AI normalize the data automatically.
                </p>
                
                <div className="flex flex-col w-full gap-4">
                  <label className="relative cursor-pointer">
                    <span className="flex items-center justify-center gap-3 w-full py-4 bg-brand-blue text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-brand-blue/20">
                      <FileUp size={18} />
                      {file ? 'Change Selection' : 'Select Project File'}
                    </span>
                    <input 
                      type="file" 
                      accept="application/pdf,image/*,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>

                  {file && !isParsing && (
                    <button 
                      onClick={parseDocument}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200"
                    >
                      Process with AI Core
                    </button>
                  )}
                </div>

                {file && (
                  <div className="mt-8 p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-4 w-full animate-in fade-in slide-in-from-bottom-2">
                    <div className="w-12 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 shadow-sm">
                      <div className="font-bold text-[10px] uppercase">
                        {file.name.split('.').pop()}
                      </div>
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">READY FOR EXTRACTION • {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                )}

                {isParsing && (
                  <div className="absolute inset-x-0 -bottom-1 p-8 pt-0">
                    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-100 p-6 shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95">
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-blue animate-progress origin-left w-full" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-brand-blue rounded-full animate-bounce" />
                        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">
                          AI Neural Engine Processing...
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-4 text-left w-full animate-in shake">
                    <div className="shrink-0 w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center shadow-inner">
                      <X size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-rose-600 uppercase tracking-wider mb-0.5">Extraction Failed</p>
                      <p className="text-[11px] text-rose-500 font-medium leading-tight line-clamp-2">{error}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                 <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Extracted Results Preview ({previewData.length} items)</h5>
                 <button onClick={() => setPreviewData([])} className="text-[10px] font-bold text-rose-500 hover:underline px-2">Clear & Retry</button>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden h-[400px] overflow-y-auto bg-slate-50">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
                    <tr className="text-slate-400 font-bold uppercase tracking-tighter text-[10px]">
                      <th className="px-4 py-2">Act. ID</th>
                      <th className="px-4 py-2">Division</th>
                      <th className="px-4 py-2">BOQ Ref</th>
                      <th className="px-4 py-2">Submittal</th>
                      <th className="px-4 py-2">Approval</th>
                      <th className="px-4 py-2">Item</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {previewData.map((item, idx) => (
                      <tr key={idx} className="bg-white hover:bg-slate-100 transition-colors">
                        <td className="px-4 py-2 font-bold text-slate-800">{item.activityId || '-'}</td>
                        <td className="px-4 py-2 font-medium truncate max-w-[100px]">{item.division}</td>
                        <td className="px-4 py-2 font-bold text-brand-blue">{item.boqRef}</td>
                        <td className="px-4 py-2 text-slate-500">{item.plannedMsDate || '---'}</td>
                        <td className="px-4 py-2 text-slate-500">{item.plannedPoDate || '---'}</td>
                        <td className="px-4 py-2 text-slate-600 truncate max-w-[200px]">{item.description}</td>
                        <td className="px-4 py-2"><StatusPill status={item.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {previewData.length > 0 && (
          <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-4 shrink-0 bg-white">
            <button 
              onClick={onClose}
              disabled={isSaving}
              className="px-6 py-2.5 text-[10px] font-bold uppercase text-slate-400 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={saveToTracker}
              disabled={isSaving}
              className="px-8 py-2.5 bg-brand-blue text-white rounded-lg text-[11px] font-bold uppercase tracking-widest hover:opacity-90 shadow-lg shadow-blue-900/10 active:scale-95 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Importing...' : `Import ${previewData.length} Entries`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddMaterialModal({ user, jobs, onClose, isView = false }: { user: any; jobs: Job[]; onClose: () => void; isView?: boolean }) {
  const [form, setForm] = useState({
    activityId: '',
    division: 'DIV.09 Finishes',
    boqRef: '',
    description: '',
    supplier: '',
    unit: 'm²',
    quantity: 0,
    location: '',
    status: 'NOT SUBMITTED',
    priority: 'MEDIUM',
    nextAction: '',
    responsible: 'Contractor',
    rev: 'R00',
    dateApproved: '',
    boqAmount: 0,
    finishCode: '',
    dateSubmitted: format(new Date(), 'yyyy-MM-dd'),
    mockupRequired: 'Not Required',
    irDwgRequired: 'NOT REQUIRED',
    irDwgStatus: 'NOT SUBMITTED',
    poStatus: 'not Issued',
    irRef: '',
    plannedMsDate: '',
    plannedPoDate: '',
    jobId: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'materials'), {
        ...form,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Log initial submission to history
      await addDoc(collection(db, 'materials', docRef.id, 'history'), {
        status: form.status,
        comment: `Initial submission of material ${form.boqRef}.`,
        updatedBy: user?.displayName || 'System',
        timestamp: serverTimestamp()
      });

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn("bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden", !isView && "max-w-2xl w-full")}>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
        <h4 className="text-sm font-bold text-slate-800">Submit New Material Entry</h4>
        {!isView && <button onClick={onClose} className="p-1 hover:text-slate-900 transition-colors">✕</button>}
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {showSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg text-xs font-bold text-center">
            Entry submitted successfully!
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">Activity ID</label>
            <input 
              type="text"
              placeholder="e.g. ACT-100"
              value={form.activityId}
              onChange={e => setForm({...form, activityId: e.target.value})}
              className="field-input"
            />
          </div>
          <div className="flex flex-col">
            <label className="field-label">Division</label>
            <select 
              value={form.division}
              onChange={e => setForm({...form, division: e.target.value})}
              className="field-input"
            >
              <option>LANDSCAPE WORKS</option>
              <option>ELEVATION WORKS</option>
              <option>DIV.02 Existing Conditions</option>
              <option>DIV.03 Concrete</option>
              <option>DIV.04 Masonry</option>
              <option>DIV.05 Metal Works</option>
              <option>DIV.06 Wood & Plastics</option>
              <option>DIV.07 Thermal & Moisture</option>
              <option>DIV.08 Doors & Windows</option>
              <option>DIV.09 Finishes</option>
              <option>DIV.10 Specialties</option>
              <option>DIV.11 Equipment</option>
              <option>DIV.12 Furnishing</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="field-label">BOQ Reference</label>
            <input 
              type="text"
              placeholder="e.g. A.1.1"
              value={form.boqRef}
              onChange={e => setForm({...form, boqRef: e.target.value})}
              className="field-input"
            />
          </div>
        </div>

        <div className="flex flex-col">
          <label className="field-label">Item / Material Description</label>
          <textarea 
            placeholder="Full description..."
            value={form.description}
            onChange={e => setForm({...form, description: e.target.value})}
            className="field-input min-h-[80px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">Finish Code</label>
            <input type="text" value={form.finishCode} onChange={e => setForm({...form, finishCode: e.target.value})} className="field-input" />
          </div>
          <div className="flex flex-col">
            <label className="field-label">Location / Area</label>
            <input type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="field-input" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">Supplier / Manufacturer</label>
            <input type="text" value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} className="field-input" />
          </div>
          <div className="flex flex-col">
            <label className="field-label">Unit</label>
            <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="field-input">
              <option>m²</option><option>m</option><option>ML</option><option>m³</option>
              <option>No.</option><option>Item</option><option>System</option><option>Various</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">Quantity</label>
            <input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: Number(e.target.value)})} className="field-input" />
          </div>
          <div className="flex flex-col">
            <label className="field-label">Priority</label>
            <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value as any})} className="field-input">
              <option>HIGH</option><option>MEDIUM</option><option>LOW</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col">
             <label className="field-label">Actual Submittal Date</label>
            <input type="date" value={form.dateSubmitted} onChange={e => setForm({...form, dateSubmitted: e.target.value})} className="field-input" />
          </div>
          <div className="flex flex-col">
             <label className="field-label">Actual Reply Date</label>
            <input type="date" value={form.dateApproved} onChange={e => setForm({...form, dateApproved: e.target.value})} className="field-input" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">Revision</label>
            <input type="text" placeholder="e.g. R00" value={form.rev} onChange={e => setForm({...form, rev: e.target.value})} className="field-input" />
          </div>
          <div className="flex flex-col">
            <label className="field-label">BOQ Amount (EGP)</label>
            <input type="number" value={form.boqAmount} onChange={e => setForm({...form, boqAmount: Number(e.target.value)})} className="field-input" />
          </div>
        </div>

        <div className="flex flex-col">
          <label className="field-label">Linked Job (Optional)</label>
          <select 
            value={form.jobId} 
            onChange={e => setForm({...form, jobId: e.target.value})} 
            className="field-input"
          >
            <option value="">No Associated Job</option>
            {jobs && jobs.map(j => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">Current Status</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="field-input">
              <option>NOT SUBMITTED</option>
              <option>Submitted</option>
              <option>Under Review</option>
              <option>Approved</option>
              <option>APPROVED AS NOTED</option>
              <option>REJECTED & RE-SUBMIT</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="field-label">Mock-Up / Drawings</label>
            <select value={form.mockupRequired} onChange={e => setForm({...form, mockupRequired: e.target.value})} className="field-input">
              <option>Not Required</option>
              <option>Required</option>
              <option>Submitted</option>
              <option>Approved</option>
              <option>Pending</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">IR/DWG Required?</label>
            <select value={form.irDwgRequired} onChange={e => setForm({...form, irDwgRequired: e.target.value})} className="field-input">
              <option value="NOT REQUIRED">Not Required</option>
              <option value="REQUIRED">Required</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="field-label">IR/DWG Status</label>
            <select 
              value={form.irDwgStatus} 
              disabled={form.irDwgRequired === 'NOT REQUIRED'}
              onChange={e => setForm({...form, irDwgStatus: e.target.value})} 
              className="field-input disabled:opacity-50"
            >
              <option>NOT SUBMITTED</option>
              <option>PENDING</option>
              <option>APPROVED</option>
              <option>REJECTED & RE-SUBMITTING</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">Next Action</label>
            <input type="text" value={form.nextAction} onChange={e => setForm({...form, nextAction: e.target.value})} className="field-input" />
          </div>
          <div className="flex flex-col">
            <label className="field-label">PO Status</label>
            <select value={form.poStatus} onChange={e => setForm({...form, poStatus: e.target.value})} className="field-input">
              <option>not Issued</option>
              <option>Issued</option>
              <option>Cash Issue</option>
              <option>waiting management approval</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <label className="field-label">Responsible (Action By)</label>
            <select value={form.responsible} onChange={e => setForm({...form, responsible: e.target.value})} className="field-input">
              <option>Contractor</option>
              <option>Consultant</option>
              <option>Client</option>
              <option>Site</option>
            </select>
          </div>
          <div className="flex flex-col">
             <label className="field-label">MS Ref. NO</label>
            <input type="text" value={form.irRef} onChange={e => setForm({...form, irRef: e.target.value})} className="field-input" />
          </div>
          <div className="flex flex-col">
             <label className="field-label">Planned Submittal Date</label>
            <input type="date" value={form.plannedMsDate} onChange={e => setForm({...form, plannedMsDate: e.target.value})} className="field-input" />
          </div>
          <div className="flex flex-col">
             <label className="field-label">Planned Approval Date</label>
            <input type="date" value={form.plannedPoDate} onChange={e => setForm({...form, plannedPoDate: e.target.value})} className="field-input" />
          </div>
        </div>

        <button 
          type="submit"
          disabled={isSaving}
          className="w-full py-3 bg-brand-blue text-white rounded-lg text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-blue-900/10 active:scale-[0.98]"
        >
          {isSaving ? 'Submitting...' : 'Confirm Submission'}
        </button>
      </form>
    </div>
  );
}

