"use client";

import { useState } from "react";
import { ThumbsUp, MessageCircle, ThumbsDown, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
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

export function InlineCareerCard({ suggestion, voteStatus, onVote, className }: InlineCareerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const hasVoted = voteStatus !== null && voteStatus !== undefined;
  const voteLabel = hasVoted ? VOTE_LABELS[voteStatus.toString() as keyof typeof VOTE_LABELS] : null;

  return (
    <Card
      className={cn(
        "inline-career-card border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/80 to-purple-50/80 p-4 shadow-sm",
        className
      )}
    >
      {/* Header with title and vote status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h4 className="font-semibold text-base text-gray-900 leading-tight">
            {suggestion.title}
          </h4>
          {suggestion.confidence && (
            <Badge variant="outline" className="mt-1.5 text-xs">
              {suggestion.confidence === "high" ? "Feels like you" : 
               suggestion.confidence === "medium" ? "Worth exploring" : 
               "Loose spark"}
            </Badge>
          )}
        </div>
        {voteLabel && (
          <Badge className={cn("shrink-0", voteLabel.color)}>
            {voteLabel.emoji} {voteLabel.label}
          </Badge>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 mb-3 leading-relaxed">
        {suggestion.summary}
      </p>

      {/* Why it fits (top 2 reasons) */}
      {suggestion.whyItFits && suggestion.whyItFits.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-600 mb-1">Why this fits you:</p>
          <ul className="text-xs text-gray-700 space-y-0.5">
            {suggestion.whyItFits.slice(0, 2).map((reason, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-blue-500 shrink-0">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="space-y-3 mb-3 pt-3 border-t border-gray-200">
          {/* Career angles */}
          {suggestion.careerAngles && suggestion.careerAngles.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Career angles:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestion.careerAngles.map((angle, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {angle}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Next steps */}
          {suggestion.nextSteps && suggestion.nextSteps.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Next steps to explore:</p>
              <ul className="text-xs text-gray-700 space-y-1">
                {suggestion.nextSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-purple-500 shrink-0">{idx + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Neighbor territories */}
          {suggestion.neighborTerritories && suggestion.neighborTerritories.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Related paths:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestion.neighborTerritories.map((territory, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {territory}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* All why it fits reasons */}
          {suggestion.whyItFits && suggestion.whyItFits.length > 2 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">More reasons:</p>
              <ul className="text-xs text-gray-700 space-y-0.5">
                {suggestion.whyItFits.slice(2).map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-blue-500 shrink-0">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!hasVoted ? (
          <>
            <Button
              size="sm"
              variant="default"
              className="flex-1 min-w-[80px] bg-green-600 hover:bg-green-700"
              onClick={() => onVote(1)}
            >
              <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 min-w-[80px] border-yellow-500 text-yellow-700 hover:bg-yellow-50"
              onClick={() => onVote(0)}
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
              Maybe
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 min-w-[80px] border-gray-400 text-gray-700 hover:bg-gray-50"
              onClick={() => onVote(-1)}
            >
              <ThumbsDown className="w-3.5 h-3.5 mr-1.5" />
              Skip
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-xs text-gray-600"
            onClick={() => onVote(voteStatus)}
          >
            Remove vote
          </Button>
        )}
        
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 mr-1.5" />
              Less
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 mr-1.5" />
              Explore
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

