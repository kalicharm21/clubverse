import type {
  EventEligibilityRules,
  FormAnswerValue,
  FormField,
  UserAccount,
} from '../../../shared/types/domain.ts';
import {BusinessRuleError, ValidationError} from '../errors/AppError.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s().-]{6,20}$/;

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateStudentEligibility(
  student: Pick<UserAccount, 'email' | 'department' | 'yearOfStudy'>,
  rules?: EventEligibilityRules | null,
): void {
  if (!rules) return;

  if (Array.isArray(rules.allowedDomains) && rules.allowedDomains.length > 0) {
    const domain = student.email.trim().toLowerCase().split('@')[1] || '';
    const allowed = rules.allowedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(domain)) {
      throw new BusinessRuleError(
        'ELIGIBILITY_DOMAIN_RESTRICTED',
        `This event is restricted to institutional email domains: ${allowed.join(', ')}`,
      );
    }
  }

  if (Array.isArray(rules.allowedDepartments) && rules.allowedDepartments.length > 0) {
    const allowed = rules.allowedDepartments.map((d) => d.trim().toLowerCase()).filter(Boolean);
    const studentDept = (student.department || '').trim().toLowerCase();
    if (allowed.length > 0 && !allowed.includes(studentDept)) {
      throw new BusinessRuleError(
        'ELIGIBILITY_DEPARTMENT_RESTRICTED',
        `This event is restricted to departments: ${rules.allowedDepartments.join(', ')}`,
      );
    }
  }

  if (Array.isArray(rules.allowedYears) && rules.allowedYears.length > 0) {
    const allowed = rules.allowedYears.map((y) => y.trim().toLowerCase()).filter(Boolean);
    const studentYear = (student.yearOfStudy || '').trim().toLowerCase();
    if (allowed.length > 0 && !allowed.some((y) => studentYear.includes(y) || y === studentYear)) {
      throw new BusinessRuleError(
        'ELIGIBILITY_YEAR_RESTRICTED',
        `This event is restricted to eligible year cohorts: ${rules.allowedYears.join(', ')}`,
      );
    }
  }
}

export function validateFormSubmissionAnswers(
  fields: FormField[],
  answers: Record<string, FormAnswerValue>,
): Record<string, FormAnswerValue> {
  const errors: Array<{fieldId: string; label: string; reason: string}> = [];
  const sanitized: Record<string, FormAnswerValue> = {};

  for (const field of fields) {
    const rawVal = answers[field.id];
    const rules = field.validationRules || {};

    if (field.type === 'checkbox') {
      const boolVal = rawVal === true;
      if (field.required && !boolVal) {
        errors.push({fieldId: field.id, label: field.label, reason: 'Confirmation is required'});
      }
      sanitized[field.id] = boolVal;
      continue;
    }

    if (field.type === 'checkboxes') {
      const selected = Array.isArray(rawVal)
        ? rawVal.map((v) => String(v).trim()).filter(Boolean)
        : typeof rawVal === 'string' && rawVal.trim()
          ? [rawVal.trim()]
          : [];

      if (field.required && selected.length === 0) {
        errors.push({fieldId: field.id, label: field.label, reason: 'Select at least one option'});
        continue;
      }
      if (field.options && field.options.length > 0) {
        const invalid = selected.filter((s) => !field.options!.includes(s));
        if (invalid.length > 0) {
          errors.push({
            fieldId: field.id,
            label: field.label,
            reason: `Invalid selection: ${invalid.join(', ')}`,
          });
          continue;
        }
      }
      sanitized[field.id] = selected;
      continue;
    }

    if (field.type === 'number') {
      const isEmpty = rawVal === undefined || rawVal === null || String(rawVal).trim() === '';
      if (isEmpty) {
        if (field.required) {
          errors.push({fieldId: field.id, label: field.label, reason: 'Number is required'});
        }
        continue;
      }
      const num = Number(rawVal);
      if (!Number.isFinite(num)) {
        errors.push({fieldId: field.id, label: field.label, reason: 'Enter a valid number'});
        continue;
      }
      if (typeof rules.min === 'number' && num < rules.min) {
        errors.push({
          fieldId: field.id,
          label: field.label,
          reason: `Must be at least ${rules.min}`,
        });
        continue;
      }
      if (typeof rules.max === 'number' && num > rules.max) {
        errors.push({
          fieldId: field.id,
          label: field.label,
          reason: `Must be at most ${rules.max}`,
        });
        continue;
      }
      sanitized[field.id] = num;
      continue;
    }

    const strVal =
      rawVal === undefined || rawVal === null ? '' : Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal).trim();

    if (!strVal) {
      if (field.required) {
        errors.push({fieldId: field.id, label: field.label, reason: 'This field is required'});
      }
      continue;
    }

    if ((field.type === 'select' || field.type === 'radio') && field.options && field.options.length > 0) {
      if (!field.options.includes(strVal)) {
        errors.push({
          fieldId: field.id,
          label: field.label,
          reason: `Select one of the valid options`,
        });
        continue;
      }
    }

    if (field.type === 'email' && !EMAIL_RE.test(strVal)) {
      errors.push({fieldId: field.id, label: field.label, reason: 'Enter a valid email address'});
      continue;
    }

    if (field.type === 'phone' && !PHONE_RE.test(strVal)) {
      errors.push({fieldId: field.id, label: field.label, reason: 'Enter a valid phone number'});
      continue;
    }

    if (field.type === 'url' && !isValidHttpUrl(strVal)) {
      errors.push({
        fieldId: field.id,
        label: field.label,
        reason: 'Enter a valid http:// or https:// URL',
      });
      continue;
    }

    if (typeof rules.minLength === 'number' && strVal.length < rules.minLength) {
      errors.push({
        fieldId: field.id,
        label: field.label,
        reason: `Must be at least ${rules.minLength} characters`,
      });
      continue;
    }

    if (typeof rules.maxLength === 'number' && strVal.length > rules.maxLength) {
      errors.push({
        fieldId: field.id,
        label: field.label,
        reason: `Must be at most ${rules.maxLength} characters`,
      });
      continue;
    }

    if (rules.pattern) {
      try {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(strVal)) {
          errors.push({
            fieldId: field.id,
            label: field.label,
            reason: rules.patternMessage || 'Value does not match the required format',
          });
          continue;
        }
      } catch {
        // Ignore invalid admin regex cleanly
      }
    }

    sanitized[field.id] = strVal;
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `Form validation failed: ${errors.map((e) => `${e.label} (${e.reason})`).join('; ')}`,
      {fieldErrors: errors},
    );
  }

  return sanitized;
}
