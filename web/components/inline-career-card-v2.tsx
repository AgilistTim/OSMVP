"use client";

import { useState } from "react";
import { ThumbsUp, MessageCircle, ThumbsDown, ChevronDown, ChevronUp, Sparkles, Target, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CareerSuggestion } from "@/components/session-provider";

interface InlineCareerCardProps {
  suggestion: CareerSuggestion;
  voteStatus?: 1 | 0 | -1 | null;
  onVote: (value: 1 | 0 | -1) => void;
  className?: string;
}

const VOTE_LABELS = {
  1: { label: "SAVED", emoji: "✅", color: "bg-green-100 text-green-800 border-green-300" },
  0: { label: "MAYBE", emoji: "🤔", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  "-1": { label: "SKIPPED", emoji: "👎", color: "bg-gray-100 text-gray-800 border-gray-300" },
};

const CONFIDENCE_CONFIG = {
  high: { icon: Sparkles, label: "Strong match", color: "text-green-600" },
  medium: { icon: Target, label: "Worth exploring", color: "text-blue-600" },
  low: { icon: Lightbulb, label: "Loose spark", color: "text-purple-600" },
};

export function InlineCareerCard({ suggestion, voteStatus, onVote, className }: InlineCareerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const hasVoted = voteStatus !== null && voteStatus !== undefined;
  const voteLabel = hasVoted ? VOTE_LABELS[voteStatus.toString() as keyof typeof VOTE_LABELS] : null;
  const confidenceConfig = CONFIDENCE_CONFIG[suggestion.confidence || 'medium'];
  const ConfidenceIcon = confidenceConfig.icon;

  return (
    <Card
      className={cn(
        "inline-career-card-v2 border-l-4 bg-white p-4 shadow-sm hover:shadow-md transition-shadow",
        suggestion.distance === 'core' ? 'border-l-blue-500' :
        suggestion.distance === 'adjacent' ? 'border-l-purple-500' :
        'border-l-amber-500',
        className
      )}
    >
      {/* Compact Header */}
      <div className="flex items-start gap-3 mb-2">
        {/* Confidence icon */}
        <div className={cn("mt-0.5 shrink-0", confidenceConfig.color)}>
          <ConfidenceIcon className="w-4 h-4" />
        </div>
        
        {/* Title and summary */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-gray-900 leading-snug mb-1">
            {suggestion.title}
          </h4>
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
            {suggestion.summary}
          </p>
        </div>
        
        {/* Vote status badge */}
        {voteLabel && (
          <Badge className={cn("shrink-0 text-xs h-5", voteLabel.color)}>
            {voteLabel.emoji}
          </Badge>
        )}
      </div>

      {/* Quick preview - Top reason why it fits */}
      {!isExpanded && suggestion.whyItFits && suggestion.whyItFits.length > 0 && (
        <div className="ml-7 mb-3">
          <p className="text-xs text-gray-700 italic">
            &ldquo;{suggestion.whyItFits[0]}&rdquo;
          </p>
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="ml-7 space-y-3 mb-3 pt-2 border-t border-gray-100">
          {/* Full summary if it was truncated */}
          <div>
            <p className="text-xs text-gray-700 leading-relaxed">
              {suggestion.summary}
            </p>
          </div>

          {/* Why it fits */}
          {suggestion.whyItFits && suggestion.whyItFits.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="text-blue-500">✓</span>
                Why this fits you
              </p>
              <ul className="text-xs text-gray-700 space-y-1">
                {suggestion.whyItFits.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-blue-400 shrink-0 mt-0.5">•</span>
                    <span className="leading-relaxed">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Career angles */}
          {suggestion.careerAngles && suggestion.careerAngles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-900 mb-1.5">Angles to explore</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestion.careerAngles.map((angle, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs font-normal">
                    {angle}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Next steps */}
          {suggestion.nextSteps && suggestion.nextSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-900 mb-1.5">First steps</p>
              <ol className="text-xs text-gray-700 space-y-1.5">
                {suggestion.nextSteps.slice(0, 3).map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-purple-500 shrink-0 font-medium">{idx + 1}.</span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Related paths */}
          {suggestion.neighborTerritories && suggestion.neighborTerritories.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-900 mb-1.5">Related paths</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestion.neighborTerritories.slice(0, 5).map((territory, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs font-normal">
                    {territory}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action buttons - Improved layout */}
      <div className="flex items-center gap-2 ml-7">
        {!hasVoted ? (
          <>
            {/* Primary action buttons */}
            <div className="flex gap-1.5 flex-1">
              <Button
                size="sm"
                variant="default"
                className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 px-2"
                onClick={() => onVote(1)}
              >
                <ThumbsUp className="w-3 h-3 mr-1" />
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs border-yellow-400 text-yellow-700 hover:bg-yellow-50 px-2"
                onClick={() => onVote(0)}
              >
                <MessageCircle className="w-3 h-3 mr-1" />
                Maybe
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 h-8 text-xs text-gray-600 hover:bg-gray-100 px-2"
                onClick={() => onVote(-1)}
              >
                <ThumbsDown className="w-3 h-3 mr-1" />
                Skip
              </Button>
            </div>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-gray-500 hover:text-gray-700"
            onClick={() => onVote(voteStatus)}
          >
            Remove vote
          </Button>
        )}
        
        {/* Explore toggle */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs shrink-0 px-3 min-w-[70px]"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3 mr-1" />
              <span>Less</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3 mr-1" />
              <span>More</span>
            </>
          )}
        </Button>
      </div>

      {/* Subtle confidence label at bottom */}
      {!isExpanded && (
        <div className="ml-7 mt-2">
          <p className={cn("text-xs", confidenceConfig.color)}>
            {confidenceConfig.label}
          </p>
        </div>
      )}
    </Card>
  );
}

