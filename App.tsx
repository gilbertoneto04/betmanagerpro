import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { NewRequestForm } from './components/NewRequestForm';
import { TaskBoard } from './components/TaskBoard';
import { HistoryLog } from './components/HistoryLog';
import { AccountList } from './components/AccountList';
import { Settings } from './components/Settings';
import { Insights } from './components/Insights';
import { PackList } from './components/PackList';
import { Login } from './components/Login';
import { Task, LogEntry, TaskStatus, TabView, TaskType, Account, Pack, User, PixKey } from './types';
import { TASK_TYPE_LABELS, TASK_STATUS_LABELS, MOCK_HOUSES } from './constants';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('DASHBOARD');
  const [authLoading, setAuthLoading] = useState(true);
  
  // Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [houses, setHouses] = useState<string[]>(MOCK_HOUSES);
  const [pixKeys, setPixKeys] = useState<PixKey[]>([]);
  const [taskTypes, setTaskTypes] = useState<{ label: string, value: string }[]>(
    Object.entries(TASK_TYPE_LABELS).map(([key, value]) => ({ label: value, value: key }))
  );
  const [users, setUsers] = useState<User[]>([]);

  // --- Auth & Data Listeners ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch extended user details from Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setCurrentUser(userSnap.data() as User);
        } else {
          // Fallback just in case
          const u: User = { 
            id: firebaseUser.uid, 
            name: firebaseUser.displayName || 'User', 
            email: firebaseUser.email || '', 
            username: firebaseUser.email?.split('@')[0] || 'user', 
            role: 'USER' 
          };
          setCurrentUser(u);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // Real-time Database Listeners
  useEffect(() => {
    if (!currentUser) return;

    // Tasks Listener
    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const loadedTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task));
      // Sort priority: orderIndex (desc) -> createdAt (desc)
      // High orderIndex comes first (top of list)
      loadedTasks.sort((a, b) => {
          const orderA = a.orderIndex !== undefined ? a.orderIndex : 0;
          const orderB = b.orderIndex !== undefined ? b.orderIndex : 0;
          if (orderA !== orderB) return orderB - orderA;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setTasks(loadedTasks);
    });

    // Accounts Listener
    const unsubAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
    });

    // Logs Listener
    const unsubLogs = onSnapshot(collection(db, 'logs'), (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry)));
    });

    // Packs Listener
    const unsubPacks = onSnapshot(collection(db, 'packs'), (snapshot) => {
      setPacks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Pack)));
    });

    // Config Listeners (Houses, TaskTypes, PixKeys, Users)
    const unsubPix = onSnapshot(collection(db, 'pixKeys'), (snapshot) => {
      setPixKeys(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PixKey)));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User)));
    });
    
    const unsubHouses = onSnapshot(collection(db, 'config_houses'), (snapshot) => {
        if (!snapshot.empty) {
            setHouses(snapshot.docs.map(d => d.data().name));
        } else {
             MOCK_HOUSES.forEach(h => addDoc(collection(db, 'config_houses'), { name: h }));
        }
    });

    const unsubTypes = onSnapshot(collection(db, 'config_types'), (snapshot) => {
        if (!snapshot.empty) {
             setTaskTypes(snapshot.docs.map(d => d.data() as {label: string, value: string}));
        }
    });

    return () => {
      unsubTasks(); unsubAccounts(); unsubLogs(); unsubPacks(); unsubPix(); unsubUsers(); unsubHouses(); unsubTypes();
    };
  }, [currentUser]);


  // --- Helpers (Now Async Writers) ---
  const addLog = async (taskId: string | undefined, taskDesc: string, action: string) => {
     await addDoc(collection(db, 'logs'), {
        taskId: taskId || 'SYSTEM',
        taskDescription: taskDesc,
        action,
        user: currentUser?.name || 'Sistema',
        timestamp: new Date().toISOString()
     });
  };

  const updatePackProgress = async (packId: string, quantityToAdd: number) => {
    const pack = packs.find(p => p.id === packId);
    if (!pack) return;
    
    const newDelivered = pack.delivered + quantityToAdd;
    const packRef = doc(db, 'packs', packId);
    
    await updateDoc(packRef, {
        delivered: newDelivered,
        status: newDelivered >= pack.quantity ? 'COMPLETED' : 'ACTIVE',
        updatedAt: new Date().toISOString()
    });
  };

  const handleUpdateUser = async (updatedUser: User) => {
      // Update local session (optimistic)
      setCurrentUser(updatedUser);
      // Update DB
      const userRef = doc(db, 'users', updatedUser.id);
      await updateDoc(userRef, { ...updatedUser });
  };
  
  const handleUpdateUserRole = async (userId: string, newRole: 'ADMIN' | 'USER') => {
      if (currentUser?.role !== 'ADMIN') return; // Security check
      
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
      addLog('SYSTEM', 'Gestão de Usuários', `Alterou cargo do usuário para ${newRole}`);
  };

  // --- Handlers ---

  const handleCreateTask = async (newTaskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTask = {
      ...newTaskData,
      orderIndex: Date.now(), // Use timestamp as simple default order (newest on top)
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const docRef = await addDoc(collection(db, 'tasks'), newTask);
    
    const typeLabel = taskTypes.find(t => t.value === newTask.type)?.label || newTask.type;
    addLog(docRef.id, `${typeLabel} - ${newTask.house}`, `Pendência criada (${TASK_STATUS_LABELS[newTask.status]})`);
  };

  const handleCreatePack = async (packData: { house: string; quantity: number; price: number }) => {
    const newPack = {
      ...packData,
      delivered: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, 'packs'), newPack);
    addLog(docRef.id, `Pack ${packData.house}`, `Novo pack criado: ${packData.quantity} contas`);
  };

  const handleUpdateStatus = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
    });

    const typeLabel = taskTypes.find(t => t.value === task.type)?.label || task.type;
    addLog(taskId, `${typeLabel} - ${task.house}`, `Status alterado: ${TASK_STATUS_LABELS[task.status]} → ${TASK_STATUS_LABELS[newStatus]}`);
  }, [tasks, taskTypes]);

  const handleEditTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, { ...updates, updatedAt: new Date().toISOString() });
    
    if (updates.pixKeyInfo && updates.pixKeyInfo !== task.pixKeyInfo) {
         addLog(taskId, `Edição - ${task.house}`, `Chave Pix atualizada.`);
    }
  }, [tasks]);

  const handleReorderTasks = async (draggedTaskId: string, targetTaskId: string) => {
    const draggedTask = tasks.find(t => t.id === draggedTaskId);
    const targetTask = tasks.find(t => t.id === targetTaskId);

    if (!draggedTask || !targetTask || draggedTaskId === targetTaskId) return;

    // Swap orderIndex Logic
    const draggedOrder = draggedTask.orderIndex || 0;
    const targetOrder = targetTask.orderIndex || 0;

    const batch = writeBatch(db);
    
    const draggedRef = doc(db, 'tasks', draggedTaskId);
    const targetRef = doc(db, 'tasks', targetTaskId);

    batch.update(draggedRef, { orderIndex: targetOrder });
    batch.update(targetRef, { orderIndex: draggedOrder });

    await batch.commit();
  };

  const handleDeleteTask = async (taskId: string, reason?: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
        status: TaskStatus.EXCLUIDA,
        deletionReason: reason,
        updatedAt: new Date().toISOString()
    });

    const typeLabel = taskTypes.find(t => t.value === task.type)?.label || task.type;
    addLog(taskId, `${typeLabel} - ${task.house}`, `Solicitação excluída. Motivo: ${reason || 'Não informado'}`);
  };

  const handleFinishNewAccountTask = async (
    taskId: string, 
    accountsData: { name: string; email: string; depositValue: number }[],
    packIdToDeduct?: string
  ) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const deliveredCount = accountsData.length;
    const requestedCount = task.quantity || 1;
    const isPartial = deliveredCount < requestedCount;

    // 1. Create Accounts Batch
    const batchPromises = accountsData.map(data => {
        return addDoc(collection(db, 'accounts'), {
            name: data.name,
            email: data.email,
            depositValue: data.depositValue,
            house: task.house,
            status: 'ACTIVE',
            tags: [],
            createdAt: new Date().toISOString(),
            taskIdSource: taskId,
            packId: packIdToDeduct
        });
    });
    await Promise.all(batchPromises);

    // 2. Update Pack
    if (packIdToDeduct) {
      await updatePackProgress(packIdToDeduct, deliveredCount);
    }

    // 3. Update Task
    const taskRef = doc(db, 'tasks', taskId);
    if (isPartial) {
        const newQuantity = requestedCount - deliveredCount;
        await updateDoc(taskRef, {
             quantity: newQuantity,
             updatedAt: new Date().toISOString()
        });
        addLog(taskId, `Entrega Parcial - ${task.house}`, `Entregues: ${deliveredCount}. Restantes: ${newQuantity}.`);
    } else {
        await updateDoc(taskRef, {
            status: TaskStatus.FINALIZADA,
            updatedAt: new Date().toISOString()
        });
        addLog(taskId, `Entrega Finalizada - ${task.house}`, `Tarefa concluída. ${deliveredCount} contas entregues.`);
    }
  };

  const handleLimitAccount = async (accountId: string, createWithdrawal: boolean, pixInfo?: string) => {
      const acc = accounts.find(a => a.id === accountId);
      if(!acc) return;

      const accRef = doc(db, 'accounts', accountId);
      await updateDoc(accRef, { status: 'LIMITED' });

      if (createWithdrawal) {
          await handleCreateTask({
               type: TaskType.SAQUE,
               house: acc.house,
               accountName: acc.name,
               description: `Gerado automaticamente ao limitar conta.`,
               pixKeyInfo: pixInfo,
               status: TaskStatus.PENDENTE 
          });
      }
      addLog(accountId, `Conta ${acc.name}`, `Conta marcada como LIMITADA.`);
  };

  const handleMarkReplacement = async (accountId: string, createWithdrawal: boolean, pixInfo?: string) => {
    const accountToUpdate = accounts.find(a => a.id === accountId);
    if (!accountToUpdate) return;
    
    // Update Pack Logic
    if (accountToUpdate.packId) {
        const pack = packs.find(p => p.id === accountToUpdate.packId);
        if (pack) {
            const packRef = doc(db, 'packs', pack.id);
            const newDelivered = Math.max(0, pack.delivered - 1);
            await updateDoc(packRef, {
                delivered: newDelivered,
                status: 'ACTIVE', // Re-open pack if needed
                updatedAt: new Date().toISOString()
            });
        }
    }

     const accRef = doc(db, 'accounts', accountId);
     await updateDoc(accRef, { status: 'REPLACEMENT' });
        
     if (createWithdrawal) {
        await handleCreateTask({
            type: TaskType.SAQUE,
            house: accountToUpdate.house,
            accountName: accountToUpdate.name,
            description: `Gerado automaticamente (Conta para Reposição).`,
            pixKeyInfo: pixInfo,
            status: TaskStatus.PENDENTE 
        });
     }
     addLog(accountId, `Conta ${accountToUpdate.name}`, `Marcada para REPOSIÇÃO.`);
  };

  const handleSaveAccount = async (accountData: Account, packIdToDeduct?: string) => {
    if (accountData.id) {
      // Edit existing
      const { id, ...data } = accountData; // remove id from payload
      const accRef = doc(db, 'accounts', id);
      await updateDoc(accRef, { ...data, updatedAt: new Date().toISOString() });
      addLog(id, `Conta ${accountData.name}`, 'Dados da conta atualizados manualmente');
    } else {
      // Create new manual
      const newAccount = {
        ...accountData,
        createdAt: new Date().toISOString(),
        packId: packIdToDeduct
      };
      // remove temp ID if present
      delete (newAccount as any).id;
      
      const ref = await addDoc(collection(db, 'accounts'), newAccount);
      
      if (packIdToDeduct) {
        await updatePackProgress(packIdToDeduct, 1);
      }
      addLog(ref.id, `Conta ${newAccount.name}`, `Conta cadastrada manualmente (${newAccount.status})`);
    }
  };

  // --- Settings Handlers ---
  
  const setHousesHandler = (newHouses: string[]) => {
      if (newHouses.length > houses.length) {
          const added = newHouses[newHouses.length - 1];
          addDoc(collection(db, 'config_houses'), { name: added });
      }
  };

  // Specialized handlers for settings to pass to child
  const handleSettingsLog = (desc: string, act: string) => addLog(undefined, desc, act);

  const handleLogout = () => {
      signOut(auth);
  };

  if (authLoading) {
      return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Carregando...</div>;
  }

  if (!currentUser) {
      return <Login onLogin={setCurrentUser} />;
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={currentUser} onLogout={handleLogout}>
      {activeTab === 'DASHBOARD' && (
          <TaskBoard 
            tasks={tasks} 
            packs={packs}
            pixKeys={pixKeys}
            currentUser={currentUser}
            onUpdateStatus={handleUpdateStatus} 
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
            onFinishNewAccountTask={handleFinishNewAccountTask} 
            onReorderTasks={handleReorderTasks}
            availableTypes={taskTypes}
          />
      )}
      {activeTab === 'NEW_REQUEST' && (
          <NewRequestForm 
            onSave={handleCreateTask} 
            availableHouses={houses} 
            availableTypes={taskTypes} 
            accounts={accounts}
            pixKeys={pixKeys}
            currentUser={currentUser}
          />
      )}
      {activeTab === 'PACKS' && (
          <PackList 
             packs={packs}
             accounts={accounts}
             availableHouses={houses}
             onCreatePack={handleCreatePack}
          />
      )}
      {activeTab === 'HISTORY' && <HistoryLog logs={logs} />}
      {activeTab === 'ACCOUNTS_ACTIVE' && (
          <AccountList 
            accounts={accounts.filter(a => a.status === 'ACTIVE')} 
            type="ACTIVE" 
            packs={packs}
            pixKeys={pixKeys}
            currentUser={currentUser}
            onLimit={handleLimitAccount} 
            onReplacement={handleMarkReplacement}
            onSave={handleSaveAccount} 
            availableHouses={houses}
          />
      )}
      {activeTab === 'ACCOUNTS_LIMITED' && (
          <AccountList 
            accounts={accounts.filter(a => a.status === 'LIMITED')} 
            type="LIMITED" 
            packs={packs}
            pixKeys={pixKeys}
            currentUser={currentUser}
            onSave={handleSaveAccount}
            onReplacement={handleMarkReplacement}
            availableHouses={houses}
          />
      )}
      {activeTab === 'ACCOUNTS_REPLACEMENT' && (
          <AccountList 
            accounts={accounts.filter(a => a.status === 'REPLACEMENT')} 
            type="REPLACEMENT" 
            packs={packs}
            pixKeys={pixKeys}
            currentUser={currentUser}
            onSave={handleSaveAccount}
            availableHouses={houses}
          />
      )}
      {activeTab === 'SETTINGS' && (
          <Settings 
            houses={houses} 
            setHouses={setHousesHandler}
            taskTypes={taskTypes} 
            setTaskTypes={() => {}} 
            pixKeys={pixKeys}
            setPixKeys={() => {}}
            currentUser={currentUser}
            users={users}
            onUpdateUser={handleUpdateUser}
            onUpdateUserRole={handleUpdateUserRole}
            logAction={handleSettingsLog}
          />
      )}
      {activeTab === 'INSIGHTS' && (
          <Insights 
            tasks={tasks} 
            accounts={accounts} 
            availableHouses={houses}
          />
      )}
    </Layout>
  );
};

export default App;