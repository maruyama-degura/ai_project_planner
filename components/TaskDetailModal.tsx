import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectTask, EditableExtendedTaskDetails, SubStep, ActionItem, SubStepStatus, NumericalTarget, NumericalTargetStatus, Decision, Attachment } from '../types';
import { XIcon, PlusIcon, TrashIcon, RefreshIcon, SparklesIcon, SubtaskIcon, NotesIcon, ResourcesIcon, ResponsibleIcon, CalendarIcon, GaugeIcon, ClipboardDocumentListIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from './icons';
import { generateStepProposals } from '../services/geminiService';
import ProposalReviewModal from './ProposalReviewModal';
import ActionItemReportModal from './ActionItemReportModal';
import ActionItemTableModal from './ActionItemTableModal';
import DecisionModal from './DecisionModal';
import CustomTaskReportModal from './CustomTaskReportModal';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface TaskDetailModalProps {
  task: ProjectTask;
  onClose: () => void;
  onUpdateTask: (taskId: string, details: EditableExtendedTaskDetails) => void;
  generateUniqueId: (prefix: string) => string;
  projectGoal: string;
  targetDate: string;
  canEdit?: boolean;
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
  const [details, setDetails] = useState<EditableExtendedTaskDetails>(() => ({
    subSteps: task.extendedDetails?.subSteps || [],
    resources: task.extendedDetails?.resources || '',
    responsible: task.extendedDetails?.responsible || '',
    notes: task.extendedDetails?.notes || '',
    numericalTarget: task.extendedDetails?.numericalTarget,
    dueDate: task.extendedDetails?.dueDate,
    reportDeck: task.extendedDetails?.reportDeck,
    resourceMatrix: task.extendedDetails?.resourceMatrix,
    attachments: task.extendedDetails?.attachments || [],
    decisions: task.extendedDetails?.decisions || [],
    subStepCanvasSize: task.extendedDetails?.subStepCanvasSize || { width: 1200, height: 800 },
  }));

  const [isGeneratingProposals, setIsGeneratingProposals] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [showProposalReview, setShowProposalReview] = useState(false);
  const [proposals, setProposals] = useState<{ title: string; description: string; }[]>([]);
  const [selectedActionItem, setSelectedActionItem] = useState<{ actionItem: ActionItem; subStepId: string } | null>(null);
  const [showActionItemTable, setShowActionItemTable] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showCustomReportModal, setShowCustomReportModal] = useState(false);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // サブステップの自動レイアウト機能を追加
  const handleAutoLayout = useCallback(() => {
    if (!canEdit) return;
    
    const CARD_WIDTH = 200;
    const CARD_HEIGHT = 120;
    const HORIZONTAL_SPACING = 250;
    const VERTICAL_SPACING = 150;
    const MARGIN = 50;

    const updatedSubSteps = details.subSteps.map((subStep, index) => ({
      ...subStep,
      position: {
        x: MARGIN + (index % 3) * HORIZONTAL_SPACING,
        y: MARGIN + Math.floor(index / 3) * VERTICAL_SPACING,
      },
    }));

    setDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
  }, [details.subSteps, canEdit]);

  const handleSave = useCallback(() => {
    onUpdateTask(task.id, details);
    onClose();
  }, [task.id, details, onUpdateTask, onClose]);

  const handleGenerateProposals = async () => {
    if (!canEdit) return;
    
    setIsGeneratingProposals(true);
    setProposalError(null);
    try {
      const generatedProposals = await generateStepProposals(task);
      setProposals(generatedProposals);
      setShowProposalReview(true);
    } catch (err) {
      setProposalError(err instanceof Error ? err.message : 'ステップ提案の生成に失敗しました。');
    } finally {
      setIsGeneratingProposals(false);
    }
  };

  const handleConfirmProposals = (additions: { newSubSteps: { title: string; description: string; }[], newActionItems: { targetSubStepId: string, title: string }[] }) => {
    const newSubSteps = additions.newSubSteps.map(proposal => ({
      id: generateUniqueId('substep'),
      text: proposal.title,
      notes: proposal.description,
      position: { x: 50 + details.subSteps.length * 250, y: 50 },
      actionItems: [],
    }));

    const updatedSubSteps = [...details.subSteps, ...newSubSteps].map(subStep => {
      const newActionItemsForThisSubStep = additions.newActionItems.filter(item => item.targetSubStepId === subStep.id);
      if (newActionItemsForThisSubStep.length > 0) {
        const newActionItems = newActionItemsForThisSubStep.map(item => ({
          id: generateUniqueId('action'),
          text: item.title,
          completed: false,
        }));
        return { ...subStep, actionItems: [...(subStep.actionItems || []), ...newActionItems] };
      }
      return subStep;
    });

    setDetails(prev => ({ ...prev, subSteps: updatedSubSteps }));
    setShowProposalReview(false);
  };

  const addSubStep = () => {
    if (!canEdit) return;
    
    const newSubStep: SubStep = {
      id: generateUniqueId('substep'),
      text: '新しいサブステップ',
      position: { x: 50 + details.subSteps.length * 250, y: 50 },
      actionItems: [],
    };
    setDetails(prev => ({ ...prev, subSteps: [...prev.subSteps, newSubStep] }));
  };

  const updateSubStep = (subStepId: string, updates: Partial<SubStep>) => {
    if (!canEdit) return;
    
    setDetails(prev => ({
      ...prev,
      subSteps: prev.subSteps.map(ss => ss.id === subStepId ? { ...ss, ...updates } : ss)
    }));
  };

  const removeSubStep = (subStepId: string) => {
    if (!canEdit) return;
    
    setDetails(prev => ({
      ...prev,
      subSteps: prev.subSteps.filter(ss => ss.id !== subStepId)
    }));
  };

  const addActionItem = (subStepId: string) => {
    if (!canEdit) return;
    
    const newActionItem: ActionItem = {
      id: generateUniqueId('action'),
      text: '新しいアクションアイテム',
      completed: false,
    };
    updateSubStep(subStepId, {
      actionItems: [...(details.subSteps.find(ss => ss.id === subStepId)?.actionItems || []), newActionItem]
    });
  };

  const updateActionItem = (subStepId: string, actionItemId: string, updates: Partial<ActionItem>) => {
    if (!canEdit) return;
    
    const subStep = details.subSteps.find(ss => ss.id === subStepId);
    if (!subStep) return;

    const updatedActionItems = (subStep.actionItems || []).map(ai => 
      ai.id === actionItemId ? { ...ai, ...updates } : ai
    );
    updateSubStep(subStepId, { actionItems: updatedActionItems });
  };

  const removeActionItem = (subStepId: string, actionItemId: string) => {
    if (!canEdit) return;
    
    const subStep = details.subSteps.find(ss => ss.id === subStepId);
    if (!subStep) return;

    const updatedActionItems = (subStep.actionItems || []).filter(ai => ai.id !== actionItemId);
    updateSubStep(subStepId, { actionItems: updatedActionItems });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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
        setDetails(prev => ({
          ...prev,
          attachments: [...(prev.attachments || []), newAttachment]
        }));
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const removeAttachment = (attachmentId: string) => {
    if (!canEdit) return;
    
    setDetails(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter(att => att.id !== attachmentId)
    }));
  };

  const flattenedActionItems = details.subSteps.flatMap(subStep => 
    (subStep.actionItems || []).map(actionItem => ({ actionItem, subStep }))
  );

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center p-4 z-[50]">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
          <header className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
            <div className="flex-grow min-w-0 mr-4">
              <h3 className="text-2xl font-bold text-slate-800 truncate">{task.title}</h3>
              <p className="text-slate-600 mt-1 line-clamp-2">{task.description}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {canEdit && (
                <>
                  <button
                    onClick={handleAutoLayout}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-200 rounded-md hover:bg-slate-300"
                    title="サブステップを自動整列"
                  >
                    <RefreshIcon className="w-4 h-4" />
                    整列
                  </button>
                  <button
                    onClick={() => setShowDecisionModal(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700"
                  >
                    <ClipboardDocumentListIcon className="w-4 h-4" />
                    決定事項
                  </button>
                </>
              )}
              <button
                onClick={() => setIsCanvasExpanded(!isCanvasExpanded)}
                className="p-2 text-slate-600 hover:text-slate-800 rounded-md hover:bg-slate-100"
                title={isCanvasExpanded ? "縮小表示" : "拡大表示"}
              >
                {isCanvasExpanded ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-5 h-5" />}
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-500 hover:text-slate-700 rounded-full hover:bg-slate-100"
              >
                <XIcon className="w-6 h-6" />
              </button>
            </div>
          </header>

          <div className="flex-grow flex overflow-hidden">
            {/* サブステップキャンバス */}
            <div className={`${isCanvasExpanded ? 'w-full' : 'w-2/3'} flex flex-col border-r border-slate-200`}>
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h4 className="font-semibold text-slate-800 flex items-center">
                  <SubtaskIcon className="w-5 h-5 mr-2" />
                  サブステップ計画 ({details.subSteps.length})
                </h4>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGenerateProposals}
                      disabled={isGeneratingProposals}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-cyan-600 rounded-md hover:bg-cyan-700 disabled:bg-slate-400"
                    >
                      {isGeneratingProposals ? <LoadingSpinner size="sm" color="border-white" /> : <SparklesIcon className="w-4 h-4" />}
                      AI提案
                    </button>
                    <button
                      onClick={addSubStep}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-green-600 rounded-md hover:bg-green-700"
                    >
                      <PlusIcon className="w-4 h-4" />
                      追加
                    </button>
                  </div>
                )}
              </div>

              {proposalError && (
                <div className="p-4 border-b border-slate-200">
                  <ErrorMessage message={proposalError} />
                </div>
              )}

              <div 
                ref={canvasRef}
                className="flex-grow overflow-auto bg-slate-50 relative"
                style={{ minHeight: '400px' }}
              >
                {details.subSteps.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <p className="text-slate-500 mb-4">サブステップがありません</p>
                      {canEdit && (
                        <button
                          onClick={addSubStep}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          最初のサブステップを追加
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full h-full min-w-[800px] min-h-[600px]">
                    {details.subSteps.map((subStep) => (
                      <SubStepCard
                        key={subStep.id}
                        subStep={subStep}
                        onUpdate={(updates) => updateSubStep(subStep.id, updates)}
                        onRemove={() => removeSubStep(subStep.id)}
                        onAddActionItem={() => addActionItem(subStep.id)}
                        onUpdateActionItem={(actionItemId, updates) => updateActionItem(subStep.id, actionItemId, updates)}
                        onRemoveActionItem={(actionItemId) => removeActionItem(subStep.id, actionItemId)}
                        onOpenActionItemReport={(actionItem) => setSelectedActionItem({ actionItem, subStepId: subStep.id })}
                        canEdit={canEdit}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 右側パネル */}
            {!isCanvasExpanded && (
              <div className="w-1/3 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <h4 className="font-semibold text-slate-800">タスク詳細</h4>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-6">
                  {/* 基本情報 */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                        <ResponsibleIcon className="w-4 h-4 mr-1" />
                        担当者
                      </label>
                      <input
                        type="text"
                        value={details.responsible}
                        onChange={(e) => setDetails(prev => ({ ...prev, responsible: e.target.value }))}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                        placeholder="担当者名"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                        <CalendarIcon className="w-4 h-4 mr-1" />
                        期日
                      </label>
                      <input
                        type="date"
                        value={details.dueDate || ''}
                        onChange={(e) => setDetails(prev => ({ ...prev, dueDate: e.target.value }))}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                        <ResourcesIcon className="w-4 h-4 mr-1" />
                        必要リソース
                      </label>
                      <textarea
                        value={details.resources}
                        onChange={(e) => setDetails(prev => ({ ...prev, resources: e.target.value }))}
                        disabled={!canEdit}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                        placeholder="必要な人員、設備、予算など"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                        <NotesIcon className="w-4 h-4 mr-1" />
                        メモ・備考
                      </label>
                      <textarea
                        value={details.notes}
                        onChange={(e) => setDetails(prev => ({ ...prev, notes: e.target.value }))}
                        disabled={!canEdit}
                        rows={4}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                        placeholder="追加の情報や注意事項"
                      />
                    </div>
                  </div>

                  {/* アクションアイテム一覧 */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="font-medium text-slate-800">アクションアイテム ({flattenedActionItems.length})</h5>
                      <button
                        onClick={() => setShowActionItemTable(true)}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        一覧表示
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {flattenedActionItems.slice(0, 5).map(({ actionItem, subStep }) => (
                        <div key={actionItem.id} className="text-xs p-2 bg-slate-50 rounded border">
                          <div className="flex items-center justify-between">
                            <span className={actionItem.completed ? 'line-through text-slate-500' : 'text-slate-800'}>
                              {actionItem.text}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${actionItem.completed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {actionItem.completed ? '完了' : '未完了'}
                            </span>
                          </div>
                          <div className="text-slate-500 mt-1">
                            サブステップ: {subStep.text}
                          </div>
                        </div>
                      ))}
                      {flattenedActionItems.length > 5 && (
                        <div className="text-xs text-slate-500 text-center py-2">
                          他 {flattenedActionItems.length - 5} 件...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="p-4 bg-slate-50 border-t flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-4">
              {canEdit && (
                <>
                  <button
                    onClick={() => setShowCustomReportModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    <SparklesIcon className="w-4 h-4" />
                    カスタムレポート作成
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50"
                  >
                    ファイル添付
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                キャンセル
              </button>
              {canEdit && (
                <button
                  onClick={handleSave}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  保存
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>

      {/* モーダル群 */}
      {showProposalReview && (
        <ProposalReviewModal
          proposals={proposals}
          existingSubSteps={details.subSteps}
          onConfirm={handleConfirmProposals}
          onClose={() => setShowProposalReview(false)}
        />
      )}

      {selectedActionItem && (
        <ActionItemReportModal
          actionItem={selectedActionItem.actionItem}
          onSave={(updatedItem) => {
            updateActionItem(selectedActionItem.subStepId, updatedItem.id, updatedItem);
            setSelectedActionItem(null);
          }}
          onClose={() => setSelectedActionItem(null)}
          generateUniqueId={generateUniqueId}
        />
      )}

      {showActionItemTable && (
        <ActionItemTableModal
          items={flattenedActionItems}
          taskName={task.title}
          onClose={() => setShowActionItemTable(false)}
        />
      )}

      {showDecisionModal && (
        <DecisionModal
          isOpen={showDecisionModal}
          onClose={() => setShowDecisionModal(false)}
          onSave={(decisions) => {
            setDetails(prev => ({ ...prev, decisions }));
            setShowDecisionModal(false);
          }}
          task={task}
          generateUniqueId={generateUniqueId}
        />
      )}

      {showCustomReportModal && (
        <CustomTaskReportModal
          task={task}
          isOpen={showCustomReportModal}
          onClose={() => setShowCustomReportModal(false)}
          onReportGenerated={(deck) => {
            setDetails(prev => ({ ...prev, reportDeck: deck }));
            setShowCustomReportModal(false);
          }}
        />
      )}
    </>
  );
};

// サブステップカードコンポーネント
const SubStepCard: React.FC<{
  subStep: SubStep;
  onUpdate: (updates: Partial<SubStep>) => void;
  onRemove: () => void;
  onAddActionItem: () => void;
  onUpdateActionItem: (actionItemId: string, updates: Partial<ActionItem>) => void;
  onRemoveActionItem: (actionItemId: string) => void;
  onOpenActionItemReport: (actionItem: ActionItem) => void;
  canEdit: boolean;
}> = ({ subStep, onUpdate, onRemove, onAddActionItem, onUpdateActionItem, onRemoveActionItem, onOpenActionItemReport, canEdit }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canEdit) return;
    
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !canEdit) return;
    
    const container = document.querySelector('.relative.w-full.h-full') as HTMLElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - dragOffset.x;
    const newY = e.clientY - containerRect.top - dragOffset.y;

    onUpdate({
      position: {
        x: Math.max(0, Math.min(newX, containerRect.width - 200)),
        y: Math.max(0, Math.min(newY, containerRect.height - 120)),
      }
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  const getStatusColor = (status?: SubStepStatus) => {
    switch (status) {
      case SubStepStatus.COMPLETED: return 'border-green-500 bg-green-50';
      case SubStepStatus.IN_PROGRESS: return 'border-blue-500 bg-blue-50';
      default: return 'border-slate-300 bg-white';
    }
  };

  return (
    <div
      className={`absolute w-48 bg-white border-2 rounded-lg shadow-md ${getStatusColor(subStep.status)} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        left: subStep.position?.x || 0,
        top: subStep.position?.y || 0,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <input
            type="text"
            value={subStep.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            disabled={!canEdit}
            className="font-medium text-sm bg-transparent border-none outline-none flex-grow"
            placeholder="サブステップ名"
          />
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-red-500 hover:text-red-700 ml-2"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-1 mb-3">
          {(subStep.actionItems || []).slice(0, 3).map((actionItem) => (
            <div key={actionItem.id} className="flex items-center text-xs">
              <input
                type="checkbox"
                checked={actionItem.completed}
                onChange={(e) => onUpdateActionItem(actionItem.id, { completed: e.target.checked })}
                disabled={!canEdit}
                className="w-3 h-3 mr-2"
              />
              <span className={actionItem.completed ? 'line-through text-slate-500' : 'text-slate-700'}>
                {actionItem.text}
              </span>
            </div>
          ))}
          {(subStep.actionItems || []).length > 3 && (
            <div className="text-xs text-slate-500">
              +{(subStep.actionItems || []).length - 3} more...
            </div>
          )}
        </div>

        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddActionItem();
            }}
            className="w-full text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
          >
            + アクション追加
          </button>
        )}
      </div>
    </div>
  );
};

export default TaskDetailModal;
