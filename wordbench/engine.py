from copy import deepcopy
import statistics

from .dataset import normalize


class RuleError(ValueError):
    pass


def apply_guess(suite, current, word, request_id, received_ms, result_ms, service_ms):
    word = normalize(word)
    for event in current['events']:
        if event['request_id'] == request_id:
            if event['word'] != word:
                raise RuleError('request_id already used with another word')
            return current, event
    if current['status'] in ('solved', 'exhausted', 'abandoned'):
        raise RuleError('Round is already finished')
    state = deepcopy(current)
    rank, error = suite.lookup(state['id'], word)
    duplicate = any(event['word'] == word for event in state['events'])
    previous = state['events'][-1] if state['events'] else None
    event = {
        'attempt': len(state['events'])+1, 'word': word, 'rank': rank,
        'error': error, 'duplicate': duplicate, 'request_id': request_id,
        'received_ms': received_ms, 'result_ms': result_ms, 'service_ms': service_ms,
        'cycle_ms': max(0, result_ms - previous['result_ms']) if previous else None,
    }
    state['events'].append(event)
    state['status'] = 'solved' if rank == 1 else 'exhausted' if len(state['events']) >= suite.limit else 'active'
    state['best_rank'] = min((item['rank'] for item in state['events'] if item['rank'] is not None), default=None)
    return state, event


def metrics(rounds, limit):
    solved = [item for item in rounds if item['status'] == 'solved']
    attempts = [len(item['events']) for item in solved]
    events = [event for item in rounds for event in item['events']]
    cycles = [event['cycle_ms'] for event in events if event['cycle_ms'] is not None]
    return {
        'rounds': len(rounds), 'solved': len(solved),
        'success_rate': len(solved)/len(rounds) if rounds else None,
        'par2': statistics.mean(len(item['events']) if item['status'] == 'solved' else 2*limit for item in rounds) if rounds else None,
        'solved_guesses_mean': statistics.mean(attempts) if attempts else None,
        'solved_guesses_median': statistics.median(attempts) if attempts else None,
        'submissions': len(events), 'invalid': sum(event['error'] is not None for event in events),
        'duplicates': sum(event['duplicate'] for event in events),
        'cycle_mean_ms': statistics.mean(cycles) if cycles else None,
        'cycle_median_ms': statistics.median(cycles) if cycles else None, 'cycle_count': len(cycles),
        'service_mean_ms': statistics.mean(event['service_ms'] for event in events) if events else None,
    }


def summarize(run, limit):
    rounds = list(run['rounds'].values())
    return {
        'complete': all(item['status'] in ('solved', 'exhausted', 'abandoned') for item in rounds),
        'finished_rounds': sum(item['status'] in ('solved', 'exhausted', 'abandoned') for item in rounds),
        'interventions': len(run['interventions']),
        'all': metrics(rounds, limit),
        'by_language': {language: metrics([item for item in rounds if item['language'] == language], limit) for language in ('ru', 'en')},
    }
