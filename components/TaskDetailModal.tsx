import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ProjectTask, SubStep, ActionItem, EditableExtendedTaskDetails, SubStepStatus, NumericalTargetStatus, Decision, Attachment } from '../types';
import { XIcon, PlusCircleIcon, TrashIcon, SubtaskIcon, NotesIcon, ResourcesIcon, ResponsibleIcon, CalendarIcon, GaugeIcon, SparklesIcon, ClipboardDocumentListIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, PaperClipIcon, LockClosedIcon, LockOpenIcon } from './icons';
import { generateStepProposals, generateInitialSlideDeck } from '../services/geminiService';
import ProposalReviewModal from './ProposalReviewModal';
import ActionItemReportModal from './ActionItemReportModal';
import ActionItemTableModal from './ActionItemTableModal';
import SlideEditorView from './SlideEditorView';
import DecisionModal from './DecisionModal';
import CustomTaskReportModal from './CustomTaskReportModal';
import LoadingSpinner from './LoadingSpinner';
import FlowConnector from './FlowConnector';

interface TaskDetailModalProps {
  task: ProjectTask;
  onClose: () => void;
  onUpdateTask: (taskId: string, updates: EditableExtendedTaskDetails) => void;
  generateUniqueId: (prefix: string) => string;
  projectGoal: string;
  targetDate: string;
  canEdit?: boolean;
}

interface ConnectorInfo {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  sourceId: string;
  targetId: string;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ 
  task, 
  onClose, 
  onUpdateTask, 
  generateUniqueId, 
  projectGoal, 
  targetDate,
  canEdit = true 
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'substeps' | 'details'>('info');
  const [maximizedPanel, setMaximizedPanel] = useState<'info' | 'substeps' | 'details' | null>(null);
  const [selectedSubStep, setSelectedSubStep] = useState<SubStep | null>(null);
  
  // Existing state variables
  const [extendedDetails, setExtendedDetails] = useState<EditableExtendedTaskDetails>(
    task.extendedDetails || {
      subSteps: [],
      resources: '',
      responsible: '',
      notes: '',
      attachments: [],
      decisions: [],
      subStepCanvasSize: { width: 1200, height: 800 }
    }
  );

  // Modal states
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isActionItemReportModalOpen, setIsActionItemReportModalOpen] = useState(false);
  const [isActionItemTableModalOpen, setIsActionItemTableModalOpen] = useState(false);
  const [isSlideEditorOpen, setIsSlideEditorOpen] = useState(false);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [isCustomReportModalOpen, setIsCustomReportModalOpen] = useState(false);
  
  // Loading and error states
  const [isGeneratingProposals, setIsGeneratingProposals] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Other states
  const [proposals, setProposals] = useState<{ title: string; description: string; }[]>([]);
  const [selectedActionItem, setSelectedActionItem] = useState<ActionItem | null>(null);
  const [selectedActionItems, setSelectedActionItems] = useState<{ actionItem: ActionItem; subStep: SubStep }[]>([]);

  // SubStep flow states
  const flowContainerRef = useRef<HTMLDivElement>(null);
  const [subStepCardRefs, setSubStepCardRefs] = useState<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [connectingState, setConnectingState] = useState<{ fromId: string; fromPos: { x: number; y: number } } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const draggedSubStepIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // File input refs
  const taskFileInputRef = useRef<HTMLInputElement>(null);
  const subStepFileInputRef = useRef<HTMLInputElement>(null);

  // Initialize subStep card refs
  useEffect(() => {
    const newRefs = new Map<string, React.RefObject<HTMLDivElement>>();
    extendedDetails.subSteps.forEach(subStep => {
      newRefs.set(subStep.id, subStepCardRefs.get(subStep.id) || React.createRef<HTMLDivElement>());
    });
    setSubStepCardRefs(newRefs);
  }, [extendedDetails.subSteps]);

  // Calculate connectors for SubStep flow
  const calculateConnectors = useCallback(() => {
    if (!flowContainerRef.current || subStepCardRefs.size === 0) {
      setConnectors([]);
      return;
    }

    const newConnectors: ConnectorInfo[] = [];
    const CARD_WIDTH = 200;
    const CARD_HEIGHT = 120;

    extendedDetails.subSteps.forEach((sourceSubStep) => {
      if (sourceSubStep.nextSubStepIds && sourceSubStep.nextSubStepIds.length > 0) {
        const sourceX = sourceSubStep.position?.x || 0;
        const sourceY = sourceSubStep.position?.y || 0;
        
        const sourcePos = {
          x: sourceX + CARD_WIDTH,
          y: sourceY + CARD_HEIGHT / 2,
        };

        sourceSubStep.nextSubStepIds.forEach(targetId => {
          const targetSubStep = extendedDetails.subSteps.find(ss => ss.id === targetId);
          if (!targetSubStep) return;
          
          const targetX = targetSubStep.position?.x || 0;
          const targetY = targetSubStep.position?.y || 0;

          const targetPos = {
            x: targetX,
            y: targetY + CARD_HEIGHT / 2,
          };
          
          newConnectors.push({
            id: `conn-${sourceSubStep.id}-${targetId}`,
            from: sourcePos,
            to: targetPos,
            sourceId: sourceSubStep.id,
            targetId: targetId,
          });
        });
      }
    });
    setConnectors(newConnectors);
  }, [extendedDetails.subSteps, subStepCardRefs]);

  const handleAutoLayoutSubSteps = useCallback(() => {
    if (!extendedDetails.subSteps) return;

    const CARD_WIDTH = 200;
    const CARD_HEIGHT = 120;
    const HORIZONTAL_SPACING = 250;
    const VERTICAL_SPACING = 150;
    const PADDING = 20;

    const updatedSubSteps = extendedDetails.subSteps.map((subStep, index) => ({
      ...subStep,
      position: {
        x: PADDING + (index % 3) * HORIZONTAL_SPACING,
        y: PADDING + Math.floor(index / 3) * VERTICAL_SPACING,
      },
    }));

    const updatedDetails = {
      ...extendedDetails,
      subSteps: updatedSubSteps,
    };

    setExtendedDetails(updatedDetails);
    onUpdateTask(task.id, updatedDetails);
    calculateConnectors(); // 🔁 位置更新後にコネクタ再描画
  }, [extendedDetails, task.id, onUpdateTask, calculateConnectors]);

  useEffect(() => {
    const timer = setTimeout(calculateConnectors, 50);
    return () => clearTimeout(timer);
  }, [calculateConnectors]);

  // SubStep flow interaction handlers
  const handleSubStepDragStart = (event: React.DragEvent<HTMLDivElement>, subStepId: string) => {
    if (!canEdit) return;
    draggedSubStepIdRef.current = subStepId;
    const subStep = extendedDetails.subSteps.find(ss => ss.id === subStepId);
    if (flowContainerRef.current) {
      const containerRect = flowContainerRef.current.getBoundingClientRect();
      dragOffsetRef.current.x = event.clientX - containerRect.left - (subStep?.position?.x || 0);
      dragOffsetRef.current.y = event.clientY - containerRect.top - (subStep?.position?.y || 0);
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleSubStepDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleSubStepDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedSubStepIdRef.current || !flowContainerRef.current || !canEdit) return;

    const containerRect = flowContainerRef.current.getBoundingClientRect();
    const CARD_WIDTH = 200;
    const CARD_HEIGHT = 120;

    let newX = event.clientX - containerRect.left - dragOffsetRef.current.x;
    let newY = event.clientY - containerRect.top - dragOffsetRef.current.y;

    const canvasSize = extendedDetails.subStepCanvasSize || { width: 1200, height: 800 };
    newX = Math.max(0, Math.min(newX, canvasSize.width - CARD_WIDTH));
    newY = Math.max(0, Math.min(newY, canvasSize.height - CARD_HEIGHT));

    const updatedSubSteps = extendedDetails.subSteps.map(ss =>
      ss.id === draggedSubStepIdRef.current
        ? { ...ss, position: { x: newX, y: newY } }
        : ss
    );

    setExtendedDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
    draggedSubStepIdRef.current = null;
    setTimeout(calculateConnectors, 0);
  };

  const handleStartConnection = (subStepId: string, event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit || !flowContainerRef.current) return;
    const containerRect = flowContainerRef.current.getBoundingClientRect();
    const fromPos = {
      x: event.clientX - containerRect.left + flowContainerRef.current.scrollLeft,
      y: event.clientY - containerRect.top + flowContainerRef.current.scrollTop,
    };
    setConnectingState({ fromId: subStepId, fromPos });
  };

  const handleEndConnection = (targetSubStepId: string) => {
    if (!connectingState || connectingState.fromId === targetSubStepId || !canEdit) {
      setConnectingState(null);
      return;
    }
    
    const updatedSubSteps = extendedDetails.subSteps.map(ss => {
      if (ss.id === connectingState.fromId) {
        const newNextSubStepIds = Array.from(new Set([...(ss.nextSubStepIds || []), targetSubStepId]));
        return { ...ss, nextSubStepIds: newNextSubStepIds };
      }
      return ss;
    });

    setExtendedDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
    setConnectingState(null);
  };

  const handleDeleteConnection = (sourceSubStepId: string, targetSubStepId: string) => {
    if (!canEdit) return;
    const updatedSubSteps = extendedDetails.subSteps.map(ss => {
      if (ss.id === sourceSubStepId) {
        const newNextSubStepIds = (ss.nextSubStepIds || []).filter(id => id !== targetSubStepId);
        return { ...ss, nextSubStepIds: newNextSubStepIds };
      }
      return ss;
    });
    setExtendedDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!connectingState || !flowContainerRef.current) return;
    const containerRect = flowContainerRef.current.getBoundingClientRect();
    setMousePos({
      x: event.clientX - containerRect.left + flowContainerRef.current.scrollLeft,
      y: event.clientY - containerRect.top + flowContainerRef.current.scrollTop,
    });
  };

  const handleMouseUp = () => {
    if (connectingState) {
      setConnectingState(null);
    }
  };

  // Save changes
  const saveChanges = useCallback(() => {
    onUpdateTask(task.id, extendedDetails);
  }, [task.id, extendedDetails, onUpdateTask]);

  useEffect(() => {
    saveChanges();
  }, [saveChanges]);

  // Existing handler functions (keeping all the original functionality)
  const handleGenerateProposals = async () => {
    if (!canEdit) return;
    setIsGeneratingProposals(true);
    setError(null);
    try {
      const generatedProposals = await generateStepProposals(task);
      setProposals(generatedProposals);
      setIsProposalModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ステップ提案の生成に失敗しました。');
    } finally {
      setIsGeneratingProposals(false);
    }
  };

  const handleConfirmProposals = (additions: { newSubSteps: { title: string; description: string; }[], newActionItems: { targetSubStepId: string, title: string }[] }) => {
    const updatedSubSteps = [...extendedDetails.subSteps];
    
    additions.newSubSteps.forEach((proposal, index) => {
      const newSubStep: SubStep = {
        id: generateUniqueId('substep'),
        text: proposal.title,
        notes: proposal.description,
        position: {
          x: 50 + (updatedSubSteps.length + index) * 220,
          y: 50
        },
        actionItems: []
      };
      updatedSubSteps.push(newSubStep);
    });

    additions.newActionItems.forEach(item => {
      const targetIndex = updatedSubSteps.findIndex(ss => ss.id === item.targetSubStepId);
      if (targetIndex !== -1) {
        const newActionItem: ActionItem = {
          id: generateUniqueId('action'),
          text: item.title,
          completed: false
        };
        updatedSubSteps[targetIndex].actionItems = [...(updatedSubSteps[targetIndex].actionItems || []), newActionItem];
      }
    });

    setExtendedDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
    setIsProposalModalOpen(false);
  };

  const handleAddSubStep = () => {
    if (!canEdit) return;
    const newSubStep: SubStep = {
      id: generateUniqueId('substep'),
      text: '新しいサブステップ',
      notes: '',
      position: {
        x: 50 + extendedDetails.subSteps.length * 220,
        y: 50
      },
      actionItems: []
    };
    setExtendedDetails(prev => ({ ...prev, subSteps: [...prev.subSteps, newSubStep] }));
  };

  const handleRemoveSubStep = (subStepId: string) => {
    if (!canEdit || !confirm('このサブステップを削除しますか？')) return;
    
    const updatedSubSteps = extendedDetails.subSteps.filter(ss => ss.id !== subStepId);
    const cleanedSubSteps = updatedSubSteps.map(ss => ({
      ...ss,
      nextSubStepIds: ss.nextSubStepIds?.filter(id => id !== subStepId)
    }));
    
    setExtendedDetails(prev => ({ ...prev, subSteps: cleanedSubSteps }));
    if (selectedSubStep?.id === subStepId) {
      setSelectedSubStep(null);
    }
  };

  const handleUpdateSubStep = (subStepId: string, updates: Partial<SubStep>) => {
    if (!canEdit) return;
    const updatedSubSteps = extendedDetails.subSteps.map(ss =>
      ss.id === subStepId ? { ...ss, ...updates } : ss
    );
    setExtendedDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
    
    if (selectedSubStep?.id === subStepId) {
      setSelectedSubStep(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const handleAddActionItem = (subStepId: string) => {
    if (!canEdit) return;
    const newActionItem: ActionItem = {
      id: generateUniqueId('action'),
      text: '新しいアクションアイテム',
      completed: false
    };
    
    const updatedSubSteps = extendedDetails.subSteps.map(ss =>
      ss.id === subStepId
        ? { ...ss, actionItems: [...(ss.actionItems || []), newActionItem] }
        : ss
    );
    setExtendedDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
  };

  const handleUpdateActionItem = (subStepId: string, actionItemId: string, updates: Partial<ActionItem>) => {
    if (!canEdit) return;
    const updatedSubSteps = extendedDetails.subSteps.map(ss =>
      ss.id === subStepId
        ? {
            ...ss,
            actionItems: ss.actionItems?.map(ai =>
              ai.id === actionItemId ? { ...ai, ...updates } : ai
            )
          }
        : ss
    );
    setExtendedDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
  };

  const handleRemoveActionItem = (subStepId: string, actionItemId: string) => {
    if (!canEdit || !confirm('このアクションアイテムを削除しますか？')) return;
    
    const updatedSubSteps = extendedDetails.subSteps.map(ss =>
      ss.id === subStepId
        ? { ...ss, actionItems: ss.actionItems?.filter(ai => ai.id !== actionItemId) }
        : ss
    );
    setExtendedDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
  };

  // File handling
  const handleTaskFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        const newAttachment: Attachment = {
          id: generateUniqueId('attach'),
          name: file.name,
          type: file.type,
          dataUrl: e.target.result,
        };
        setExtendedDetails(prev => ({
          ...prev,
          attachments: [...(prev.attachments || []), newAttachment]
        }));
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSubStepFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit || !selectedSubStep) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        const newAttachment: Attachment = {
          id: generateUniqueId('attach'),
          name: file.name,
          type: file.type,
          dataUrl: e.target.result,
        };
        handleUpdateSubStep(selectedSubStep.id, {
          attachments: [...(selectedSubStep.attachments || []), newAttachment]
        });
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveTaskAttachment = (attachmentId: string) => {
    if (!canEdit) return;
    setExtendedDetails(prev => ({
      ...prev,
      attachments: prev.attachments?.filter(att => att.id !== attachmentId)
    }));
  };

  const handleRemoveSubStepAttachment = (attachmentId: string) => {
    if (!canEdit || !selectedSubStep) return;
    handleUpdateSubStep(selectedSubStep.id, {
      attachments: selectedSubStep.attachments?.filter(att => att.id !== attachmentId)
    });
  };

  // Report generation
  const handleGenerateReport = async () => {
    if (!canEdit) return;
    setIsGeneratingReport(true);
    setError(null);
    try {
      const deck = await generateInitialSlideDeck(task, projectGoal);
      setExtendedDetails(prev => ({ ...prev, reportDeck: deck }));
      setIsSlideEditorOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'レポートの生成に失敗しました。');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSaveReport = (deck: any) => {
    setExtendedDetails(prev => ({ ...prev, reportDeck: deck }));
  };

  // Action item table
  const handleOpenActionItemTable = (subStep?: SubStep) => {
    if (subStep) {
      const items = (subStep.actionItems || []).map(ai => ({ actionItem: ai, subStep }));
      setSelectedActionItems(items);
    } else {
      const allItems: { actionItem: ActionItem; subStep: SubStep }[] = [];
      extendedDetails.subSteps.forEach(ss => {
        (ss.actionItems || []).forEach(ai => {
          allItems.push({ actionItem: ai, subStep: ss });
        });
      });
      setSelectedActionItems(allItems);
    }
    setIsActionItemTableModalOpen(true);
  };

  // Decision management
  const handleSaveDecisions = (decisions: Decision[]) => {
    setExtendedDetails(prev => ({ ...prev, decisions }));
    setIsDecisionModalOpen(false);
  };

  // Render functions
  const renderTaskInfo = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            <ResponsibleIcon className="w-5 h-5 inline mr-2" />
            担当者
          </label>
          <input
            type="text"
            value={extendedDetails.responsible}
            onChange={(e) => setExtendedDetails(prev => ({ ...prev, responsible: e.target.value }))}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
            placeholder="担当者名を入力"
          />
        </div>
        
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            <CalendarIcon className="w-5 h-5 inline mr-2" />
            期日
          </label>
          <input
            type="date"
            value={extendedDetails.dueDate || ''}
            onChange={(e) => setExtendedDetails(prev => ({ ...prev, dueDate: e.target.value }))}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          <ResourcesIcon className="w-5 h-5 inline mr-2" />
          必要なリソース
        </label>
        <textarea
          value={extendedDetails.resources}
          onChange={(e) => setExtendedDetails(prev => ({ ...prev, resources: e.target.value }))}
          disabled={!canEdit}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
          placeholder="必要な人員、設備、予算などを記載"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          <NotesIcon className="w-5 h-5 inline mr-2" />
          メモ・詳細
        </label>
        <textarea
          value={extendedDetails.notes}
          onChange={(e) => setExtendedDetails(prev => ({ ...prev, notes: e.target.value }))}
          disabled={!canEdit}
          rows={4}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
          placeholder="追加の詳細情報やメモを記載"
        />
      </div>

      {/* Numerical Target */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          <GaugeIcon className="w-5 h-5 inline mr-2" />
          数値目標
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            value={extendedDetails.numericalTarget?.description || ''}
            onChange={(e) => setExtendedDetails(prev => ({
              ...prev,
              numericalTarget: { ...prev.numericalTarget, description: e.target.value, targetValue: prev.numericalTarget?.targetValue || '', unit: prev.numericalTarget?.unit || '' }
            }))}
            disabled={!canEdit}
            className="px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
            placeholder="目標の説明"
          />
          <input
            type="text"
            value={extendedDetails.numericalTarget?.targetValue || ''}
            onChange={(e) => setExtendedDetails(prev => ({
              ...prev,
              numericalTarget: { ...prev.numericalTarget, description: prev.numericalTarget?.description || '', targetValue: e.target.value, unit: prev.numericalTarget?.unit || '' }
            }))}
            disabled={!canEdit}
            className="px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
            placeholder="目標値"
          />
          <input
            type="text"
            value={extendedDetails.numericalTarget?.unit || ''}
            onChange={(e) => setExtendedDetails(prev => ({
              ...prev,
              numericalTarget: { ...prev.numericalTarget, description: prev.numericalTarget?.description || '', targetValue: prev.numericalTarget?.targetValue || '', unit: e.target.value }
            }))}
            disabled={!canEdit}
            className="px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
            placeholder="単位"
          />
        </div>
      </div>

      {/* Attachments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-slate-700">
            <PaperClipIcon className="w-5 h-5 inline mr-2" />
            添付ファイル
          </label>
          {canEdit && (
            <button
              onClick={() => taskFileInputRef.current?.click()}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ファイルを追加
            </button>
          )}
        </div>
        <input
          type="file"
          ref={taskFileInputRef}
          onChange={handleTaskFileChange}
          className="hidden"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(extendedDetails.attachments || []).map(attachment => (
            <div key={attachment.id} className="relative group border rounded-md overflow-hidden bg-white shadow-sm">
              <a href={attachment.dataUrl} download={attachment.name} className="block">
                {attachment.type.startsWith('image/') ? (
                  <img src={attachment.dataUrl} alt={attachment.name} className="w-full h-20 object-cover" />
                ) : (
                  <div className="w-full h-20 bg-slate-100 flex items-center justify-center">
                    <PaperClipIcon className="w-8 h-8 text-slate-500" />
                  </div>
                )}
              </a>
              <div className="p-1">
                <p className="text-xs truncate" title={attachment.name}>{attachment.name}</p>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleRemoveTaskAttachment(attachment.id)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <TrashIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {canEdit && (
          <>
            <button
              onClick={() => setIsDecisionModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              <ClipboardDocumentListIcon className="w-5 h-5" />
              決定事項管理
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400"
            >
              {isGeneratingReport ? <LoadingSpinner size="sm" color="border-white" /> : <SparklesIcon className="w-5 h-5" />}
              AIレポート生成
            </button>
            <button
              onClick={() => setIsCustomReportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
            >
              <SparklesIcon className="w-5 h-5" />
              カスタムレポート
            </button>
          </>
        )}
        <button
          onClick={() => handleOpenActionItemTable()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <ClipboardDocumentListIcon className="w-5 h-5" />
          全アクションアイテム
        </button>
      </div>
    </div>
  );

  const renderSubStepCard = (subStep: SubStep) => {
    const getStatusColor = (status?: SubStepStatus) => {
      switch(status) {
        case SubStepStatus.COMPLETED: return 'border-green-500 bg-green-50';
        case SubStepStatus.IN_PROGRESS: return 'border-blue-500 bg-blue-50';
        default: return 'border-slate-300 bg-white';
      }
    };

    return (
      <div
        key={subStep.id}
        ref={subStepCardRefs.get(subStep.id)}
        draggable={canEdit}
        onDragStart={(e) => handleSubStepDragStart(e, subStep.id)}
        onMouseUp={() => handleEndConnection(subStep.id)}
        onClick={() => setSelectedSubStep(subStep)}
        className={`absolute w-48 min-h-[120px] p-3 border-2 rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-all ${getStatusColor(subStep.status)} ${selectedSubStep?.id === subStep.id ? 'ring-2 ring-blue-500' : ''}`}
        style={{
          left: subStep.position?.x || 0,
          top: subStep.position?.y || 0,
        }}
      >
        {canEdit && (
          <div
            onMouseDown={(e) => handleStartConnection(subStep.id, e)}
            className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-crosshair hover:scale-125 transition-transform z-10"
            title="ドラッグして接続"
          />
        )}
        
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold text-sm text-slate-800 flex-grow pr-2">{subStep.text}</h4>
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveSubStep(subStep.id);
              }}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        
        <div className="text-xs text-slate-600 mb-2">
          {subStep.actionItems?.length || 0} アクション
        </div>
        
        {subStep.status && (
          <div className="text-xs font-medium">
            {subStep.status}
          </div>
        )}
      </div>
    );
  };

  const renderSubSteps = () => (
    <div className="h-full flex">
      {/* SubStep Flow Canvas */}
      <div className="flex-1 border-r border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">サブステップ計画</h3>
            {canEdit && (
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateProposals}
                  disabled={isGeneratingProposals}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-slate-400"
                >
                  {isGeneratingProposals ? <LoadingSpinner size="sm" color="border-white" /> : <SparklesIcon className="w-4 h-4" />}
                  AI提案
                </button>
                <button
                  onClick={handleAddSubStep}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <PlusCircleIcon className="w-4 h-4" />
                  追加
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div
          ref={flowContainerRef}
          className="relative overflow-auto h-[calc(100%-80px)] bg-slate-50"
          onDragOver={handleSubStepDragOver}
          onDrop={handleSubStepDrop}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{
            width: '100%',
            height: extendedDetails.subStepCanvasSize?.height || 800,
          }}
        >
          <div
            className="relative"
            style={{
              width: extendedDetails.subStepCanvasSize?.width || 1200,
              height: extendedDetails.subStepCanvasSize?.height || 800,
            }}
          >
            {extendedDetails.subSteps.map(renderSubStepCard)}
            
            {/* Connectors */}
            {connectors.map(conn => (
              <FlowConnector
                key={conn.id}
                from={conn.from}
                to={conn.to}
                id={conn.id}
                onDelete={canEdit ? () => handleDeleteConnection(conn.sourceId, conn.targetId) : undefined}
              />
            ))}
            
            {/* Preview connector */}
            {connectingState && (
              <FlowConnector
                from={connectingState.fromPos}
                to={mousePos}
                id="preview-connector"
              />
            )}
          </div>
        </div>
      </div>

      {/* SubStep Details Panel */}
      <div className="w-96 bg-white">
        {selectedSubStep ? (
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">サブステップの詳細</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">タイトル</label>
                <input
                  type="text"
                  value={selectedSubStep.text}
                  onChange={(e) => handleUpdateSubStep(selectedSubStep.id, { text: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">ステータス</label>
                <select
                  value={selectedSubStep.status || SubStepStatus.NOT_STARTED}
                  onChange={(e) => handleUpdateSubStep(selectedSubStep.id, { status: e.target.value as SubStepStatus })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
                >
                  <option value={SubStepStatus.NOT_STARTED}>未着手</option>
                  <option value={SubStepStatus.IN_PROGRESS}>進行中</option>
                  <option value={SubStepStatus.COMPLETED}>完了</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">担当者</label>
                <input
                  type="text"
                  value={selectedSubStep.responsible || ''}
                  onChange={(e) => handleUpdateSubStep(selectedSubStep.id, { responsible: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">期日</label>
                <input
                  type="date"
                  value={selectedSubStep.dueDate || ''}
                  onChange={(e) => handleUpdateSubStep(selectedSubStep.id, { dueDate: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">メモ</label>
                <textarea
                  value={selectedSubStep.notes || ''}
                  onChange={(e) => handleUpdateSubStep(selectedSubStep.id, { notes: e.target.value })}
                  disabled={!canEdit}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              {/* SubStep Attachments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-slate-700">添付ファイル</label>
                  {canEdit && (
                    <button
                      onClick={() => subStepFileInputRef.current?.click()}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      追加
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={subStepFileInputRef}
                  onChange={handleSubStepFileChange}
                  className="hidden"
                />
                <div className="space-y-2">
                  {(selectedSubStep.attachments || []).map(attachment => (
                    <div key={attachment.id} className="flex items-center justify-between p-2 border rounded-md">
                      <a href={attachment.dataUrl} download={attachment.name} className="text-sm text-blue-600 hover:underline truncate">
                        {attachment.name}
                      </a>
                      {canEdit && (
                        <button
                          onClick={() => handleRemoveSubStepAttachment(attachment.id)}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-slate-700">アクションアイテム</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenActionItemTable(selectedSubStep)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      一覧表示
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => handleAddActionItem(selectedSubStep.id)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        追加
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(selectedSubStep.actionItems || []).map(actionItem => (
                    <div key={actionItem.id} className="p-2 border rounded-md">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2 flex-1">
                          <input
                            type="checkbox"
                            checked={actionItem.completed}
                            onChange={(e) => handleUpdateActionItem(selectedSubStep.id, actionItem.id, { 
                              completed: e.target.checked,
                              completedDate: e.target.checked ? new Date().toISOString().split('T')[0] : undefined
                            })}
                            disabled={!canEdit}
                            className="mt-1"
                          />
                          <input
                            type="text"
                            value={actionItem.text}
                            onChange={(e) => handleUpdateActionItem(selectedSubStep.id, actionItem.id, { text: e.target.value })}
                            disabled={!canEdit}
                            className="flex-1 text-sm border-none outline-none bg-transparent"
                          />
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setSelectedActionItem(actionItem);
                              setIsActionItemReportModalOpen(true);
                            }}
                            className="text-blue-500 hover:text-blue-700 p-1"
                            title="レポート"
                          >
                            <NotesIcon className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleRemoveActionItem(selectedSubStep.id, actionItem.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {actionItem.responsible && (
                        <div className="text-xs text-slate-500 mt-1">担当: {actionItem.responsible}</div>
                      )}
                      {actionItem.dueDate && (
                        <div className="text-xs text-slate-500">期日: {actionItem.dueDate}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            <div className="text-center">
              <SubtaskIcon className="w-12 h-12 mx-auto mb-2 text-slate-400" />
              <p>サブステップを選択してください</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderDetails = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">決定事項</h3>
        <div className="space-y-2">
          {(extendedDetails.decisions || []).slice(0, 5).map(decision => (
            <div key={decision.id} className="p-3 border rounded-md">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  decision.status === 'decided' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {decision.status === 'decided' ? '決定済み' : '未決定'}
                </span>
                {decision.date && <span className="text-xs text-slate-500">{decision.date}</span>}
              </div>
              <p className="font-medium text-slate-800 mt-1">{decision.question}</p>
              {decision.decision && <p className="text-sm text-slate-600 mt-1">{decision.decision}</p>}
            </div>
          ))}
          {(extendedDetails.decisions || []).length > 5 && (
            <p className="text-sm text-slate-500">他 {(extendedDetails.decisions || []).length - 5} 件...</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">進捗サマリー</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{extendedDetails.subSteps.length}</div>
            <div className="text-sm text-blue-800">サブステップ</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {extendedDetails.subSteps.filter(ss => ss.status === SubStepStatus.COMPLETED).length}
            </div>
            <div className="text-sm text-green-800">完了済み</div>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {extendedDetails.subSteps.reduce((total, ss) => total + (ss.actionItems?.length || 0), 0)}
            </div>
            <div className="text-sm text-yellow-800">アクションアイテム</div>
          </div>
        </div>
      </div>

      {extendedDetails.reportDeck && (
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">生成済みレポート</h3>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">タスクレポート</p>
                <p className="text-sm text-slate-500">{extendedDetails.reportDeck.slides.length} スライド</p>
              </div>
              <button
                onClick={() => setIsSlideEditorOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                レポートを開く
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const getPanelClass = (panelName: 'info' | 'substeps' | 'details') => {
    if (maximizedPanel === panelName) return 'col-span-3';
    if (maximizedPanel && maximizedPanel !== panelName) return 'hidden';
    return 'col-span-1';
  };

  if (isSlideEditorOpen && extendedDetails.reportDeck) {
    return (
      <SlideEditorView
        tasks={[task]}
        initialDeck={extendedDetails.reportDeck}
        onSave={handleSaveReport}
        onClose={() => setIsSlideEditorOpen(false)}
        projectGoal={projectGoal}
        targetDate={targetDate}
        reportScope="task"
        generateUniqueId={generateUniqueId}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-slate-100 z-[50] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-slate-800">{task.title}</h2>
              <p className="text-slate-600 mt-1">{task.description}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full"
            >
              <XIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white border-b border-slate-200 px-4">
          <div className="flex space-x-8">
            {[
              { id: 'info', label: 'タスク情報', icon: NotesIcon },
              { id: 'substeps', label: 'サブステップ', icon: SubtaskIcon },
              { id: 'details', label: 'サブステップの詳細', icon: ClipboardDocumentListIcon }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
                {maximizedPanel !== id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMaximizedPanel(maximizedPanel === id ? null : id as any);
                    }}
                    className="ml-2 p-1 hover:bg-slate-200 rounded"
                    title={maximizedPanel === id ? "最小化" : "最大化"}
                  >
                    {maximizedPanel === id ? (
                      <ArrowsPointingInIcon className="w-4 h-4" />
                    ) : (
                      <ArrowsPointingOutIcon className="w-4 h-4" />
                    )}
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {maximizedPanel ? (
            <div className="h-full">
              {maximizedPanel === 'info' && (
                <div className="h-full overflow-y-auto p-6">
                  {renderTaskInfo()}
                </div>
              )}
              {maximizedPanel === 'substeps' && (
                <div className="h-full">
                  {renderSubSteps()}
                </div>
              )}
              {maximizedPanel === 'details' && (
                <div className="h-full overflow-y-auto p-6">
                  {renderDetails()}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 h-full">
              <div className="border-r border-slate-200 overflow-y-auto">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">タスク情報</h3>
                    <button
                      onClick={() => setMaximizedPanel('info')}
                      className="p-1 hover:bg-slate-200 rounded"
                      title="最大化"
                    >
                      <ArrowsPointingOutIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  {renderTaskInfo()}
                </div>
              </div>

              <div className="border-r border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">サブステップ</h3>
                    <button
                      onClick={() => setMaximizedPanel('substeps')}
                      className="p-1 hover:bg-slate-200 rounded"
                      title="最大化"
                    >
                      <ArrowsPointingOutIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="h-[calc(100%-80px)]">
                  {renderSubSteps()}
                </div>
              </div>

              <div className="overflow-y-auto">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">サブステップの詳細</h3>
                    <button
                      onClick={() => setMaximizedPanel('details')}
                      className="p-1 hover:bg-slate-200 rounded"
                      title="最大化"
                    >
                      <ArrowsPointingOutIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  {renderDetails()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-100 border-t border-red-200">
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 text-sm mt-1"
            >
              閉じる
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {isProposalModalOpen && (
        <ProposalReviewModal
          proposals={proposals}
          existingSubSteps={extendedDetails.subSteps}
          onConfirm={handleConfirmProposals}
          onClose={() => setIsProposalModalOpen(false)}
        />
      )}

      {isActionItemReportModalOpen && selectedActionItem && (
        <ActionItemReportModal
          actionItem={selectedActionItem}
          onSave={(updatedItem) => {
            const subStep = extendedDetails.subSteps.find(ss => 
              ss.actionItems?.some(ai => ai.id === updatedItem.id)
            );
            if (subStep) {
              handleUpdateActionItem(subStep.id, updatedItem.id, updatedItem);
            }
            setIsActionItemReportModalOpen(false);
          }}
          onClose={() => setIsActionItemReportModalOpen(false)}
          generateUniqueId={generateUniqueId}
        />
      )}

      {isActionItemTableModalOpen && (
        <ActionItemTableModal
          items={selectedActionItems}
          taskName={task.title}
          onClose={() => setIsActionItemTableModalOpen(false)}
        />
      )}

      {isDecisionModalOpen && (
        <DecisionModal
          isOpen={isDecisionModalOpen}
          onClose={() => setIsDecisionModalOpen(false)}
          onSave={handleSaveDecisions}
          task={task}
          generateUniqueId={generateUniqueId}
        />
      )}

      {isCustomReportModalOpen && (
        <CustomTaskReportModal
          task={task}
          isOpen={isCustomReportModalOpen}
          onClose={() => setIsCustomReportModalOpen(false)}
          onReportGenerated={(deck) => {
            setExtendedDetails(prev => ({ ...prev, reportDeck: deck }));
            setIsCustomReportModalOpen(false);
            setIsSlideEditorOpen(true);
          }}
        />
      )}
    </>
  );
};

export default TaskDetailModal;